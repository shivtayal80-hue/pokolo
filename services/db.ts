import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Product, Transaction, InventoryItem, User } from '../types';
import { dbService as mockDbService } from './mockDb';

class SupabaseService {
  
  // --- Auth Helper ---
  async getCurrentUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return session.user;
  }

  // --- Real-time Subscription ---
  subscribe(userId: string, onUpdate: () => void): () => void {
    const channel = supabase
      .channel('realtime-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => onUpdate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `user_id=eq.${userId}` }, () => onUpdate())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  // --- Products ---
  async getProducts(userId: string): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    
    return data.map((p: any) => ({
      id: p.id,
      userId: p.user_id,
      name: p.name,
      category: p.category,
      minStockLevel: p.min_stock_level,
      unit: p.unit
    }));
  }

  async addProduct(product: Omit<Product, 'id' | 'userId'>, userId: string): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .insert([{
        user_id: userId,
        name: product.name,
        category: product.category,
        min_stock_level: product.minStockLevel,
        unit: product.unit
      }])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      name: data.name,
      category: data.category,
      minStockLevel: data.min_stock_level,
      unit: data.unit
    };
  }

  // --- Transactions ---
  async getTransactions(userId: string): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) throw error;

    return data.map((t: any) => {
      // Client-side overdue check (can be done in DB view alternatively)
      let status = t.payment_status;
      if (status === 'pending' && t.due_date && new Date(t.due_date) < new Date()) {
        status = 'overdue';
      }

      return {
        id: t.id,
        userId: t.user_id,
        productId: t.product_id,
        productName: t.product_name,
        type: t.type,
        partyName: t.party_name,
        quantity: t.quantity,
        unit: t.unit,
        pricePerUnit: t.price_per_unit,
        totalValue: t.total_value,
        date: t.date,
        paymentType: t.payment_type || 'cash',
        paymentStatus: status || 'paid',
        dueDate: t.due_date,
        creditPeriod: t.credit_period
      };
    });
  }

  async addTransaction(
    tx: Omit<Transaction, 'id' | 'totalValue' | 'productName' | 'unit' | 'userId' | 'paymentStatus' | 'dueDate'> & { creditPeriod?: number }, 
    products: Product[],
    userId: string
  ): Promise<Transaction> {
    
    const product = products.find(p => p.id === tx.productId);
    if (!product) throw new Error("Product not found");

    const totalValue = tx.quantity * tx.pricePerUnit;

    // Lifecycle Logic
    let dueDate: string | undefined;
    let paymentStatus = 'paid';

    if (tx.paymentType === 'credit') {
      paymentStatus = 'pending';
      if (tx.creditPeriod) {
        const date = new Date(tx.date);
        date.setDate(date.getDate() + tx.creditPeriod);
        dueDate = date.toISOString();
      }
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        user_id: userId,
        product_id: tx.productId,
        product_name: product.name,
        type: tx.type,
        party_name: tx.partyName,
        quantity: tx.quantity,
        unit: product.unit,
        price_per_unit: tx.pricePerUnit,
        total_value: totalValue,
        date: tx.date,
        payment_type: tx.paymentType,
        payment_status: paymentStatus,
        due_date: dueDate,
        credit_period: tx.creditPeriod
      }])
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      userId: data.user_id,
      productId: data.product_id,
      productName: data.product_name,
      type: data.type,
      partyName: data.party_name,
      quantity: data.quantity,
      unit: data.unit,
      pricePerUnit: data.price_per_unit,
      totalValue: data.total_value,
      date: data.date,
      paymentType: data.payment_type,
      paymentStatus: data.payment_status,
      dueDate: data.due_date,
      creditPeriod: data.credit_period
    };
  }

  async markTransactionAsPaid(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .update({ payment_status: 'paid' })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async deleteTransaction(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId); 

    if (error) throw error;
  }

  async getInventorySummary(userId: string): Promise<InventoryItem[]> {
    const products = await this.getProducts(userId);
    const transactions = await this.getTransactions(userId);

    return products.map(product => {
      const productTx = transactions.filter(t => t.productId === product.id);
      
      let stock = 0;
      let totalCost = 0;
      let totalPurchased = 0;

      productTx.forEach(tx => {
        if (tx.type === 'purchase') {
          stock += tx.quantity;
          totalPurchased += tx.quantity;
          totalCost += (tx.quantity * tx.pricePerUnit);
        } else {
          stock -= tx.quantity;
        }
      });

      const avgCost = totalPurchased > 0 ? totalCost / totalPurchased : 0;
      const status = stock <= 0 ? 'out' : stock < product.minStockLevel ? 'low' : 'ok';

      return {
        ...product,
        stock,
        avgCost,
        totalValue: stock * avgCost,
        status
      };
    });
  }
}

export const dbService = isSupabaseConfigured ? new SupabaseService() : mockDbService;