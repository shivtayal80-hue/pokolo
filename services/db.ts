import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Product, Transaction, InventoryItem } from '../types';
import { dbService as mockDbService } from './mockDb';
import { safeString } from '../lib/utils';

class SupabaseService {
  
  async getCurrentUser() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) console.error("Session error:", error.message);
    if (!session?.user) return null;
    return session.user;
  }

  subscribe(userId: string, onUpdate: () => void): () => void {
    const channel = supabase
      .channel('realtime-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => onUpdate())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `user_id=eq.${userId}` }, () => onUpdate())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }

  async getProducts(userId: string): Promise<Product[]> {
    const { data, error } = await supabase.from('products').select('*').eq('user_id', userId).order('name', { ascending: true });
    if (error) throw new Error(error.message || 'Failed to fetch products');
    return (data || []).map((p: any) => ({ 
      id: safeString(p.id), 
      userId: safeString(p.user_id), 
      name: safeString(p.name) || 'Unknown Product', 
      category: safeString(p.category) || 'General', 
      minStockLevel: Number(p.min_stock_level) || 0, 
      unit: safeString(p.unit) || 'units' 
    }));
  }

  async addProduct(product: Omit<Product, 'id' | 'userId'>, userId: string): Promise<Product> {
    const { data, error } = await supabase.from('products').insert([{ 
      user_id: userId, 
      name: product.name, 
      category: product.category, 
      min_stock_level: product.minStockLevel, 
      unit: product.unit 
    }]).select().single();
    
    if (error) throw new Error(error.message || 'Failed to add product');
    
    return { 
      id: safeString(data.id), 
      userId: safeString(data.user_id), 
      name: safeString(data.name), 
      category: safeString(data.category), 
      minStockLevel: Number(data.min_stock_level), 
      unit: safeString(data.unit) 
    };
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    const { data, error } = await supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message || 'Failed to fetch transactions');
    
    return (data || []).map((t: any) => {
      let status: 'paid' | 'pending' | 'overdue' = t.payment_status || 'paid';
      if (status === 'pending' && t.due_date) {
        const dueDate = new Date(t.due_date);
        const today = new Date();
        today.setHours(0,0,0,0);
        if (dueDate < today) status = 'overdue';
      }
      return {
        id: safeString(t.id),
        userId: safeString(t.user_id),
        productId: safeString(t.product_id),
        productName: safeString(t.product_name) || 'Item',
        type: (t.type === 'sale' ? 'sale' : 'purchase') as 'purchase' | 'sale',
        partyName: safeString(t.party_name) || 'N/A',
        quantity: Number(t.quantity) || 0,
        deduction: Number(t.deduction || 0),
        deductionReason: t.deduction_reason ? safeString(t.deduction_reason) : undefined,
        
        extraAmount: Number(t.extra_amount || 0),
        extraReason: t.extra_reason ? safeString(t.extra_reason) : undefined,

        unit: safeString(t.unit) || 'units',
        pricePerUnit: Number(t.price_per_unit) || 0,
        totalValue: Number(t.total_value) || 0,
        date: safeString(t.date),
        paymentType: (t.payment_type === 'credit' ? 'credit' : 'cash') as 'cash' | 'credit',
        paymentStatus: status,
        dueDate: t.due_date ? safeString(t.due_date) : undefined,
        creditPeriod: t.credit_period ? Number(t.credit_period) : undefined
      };
    });
  }

  async addTransaction(
    tx: {
      items: { productId: string; quantity: number; deduction?: number; deductionReason?: string; pricePerUnit: number }[];
      type: 'purchase' | 'sale';
      partyName: string;
      date: string;
      paymentType: 'cash' | 'credit';
      creditPeriod?: number;
      extraAmount?: number;
      extraReason?: string;
    },
    products: Product[],
    userId: string
  ): Promise<void> {
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

    const rows = tx.items.map((item, index) => {
      const product = products.find(p => p.id === item.productId);
      if (!product) throw new Error(`Product not found for ID: ${item.productId}`);

      const grossQty = Number(item.quantity) || 0;
      const deductionAmt = Number(item.deduction) || 0;
      const netQuantity = grossQty - deductionAmt;
      
      // We only apply the extra amount to the FIRST item to avoid inflating revenue/cost totals
      // when aggregating later.
      const assignedExtra = index === 0 ? (Number(tx.extraAmount) || 0) : 0;
      const assignedReason = index === 0 ? (tx.extraReason || null) : null;
      
      const itemTotal = (netQuantity * (Number(item.pricePerUnit) || 0)) + assignedExtra;

      return {
        user_id: userId,
        product_id: item.productId,
        product_name: product.name,
        type: tx.type,
        party_name: tx.partyName,
        quantity: grossQty,
        deduction: deductionAmt,
        deduction_reason: item.deductionReason || null,
        unit: product.unit,
        price_per_unit: item.pricePerUnit,
        total_value: itemTotal,
        date: tx.date,
        payment_type: tx.paymentType,
        payment_status: paymentStatus,
        due_date: dueDate,
        credit_period: tx.creditPeriod,
        extra_amount: assignedExtra,
        extra_reason: assignedReason
      };
    });

    const { error } = await supabase.from('transactions').insert(rows);
    
    if (error) {
       const errMsg = error.message || error.details || error.hint || 'Transaction creation failed';
       throw new Error(errMsg);
    }
  }

  async markTransactionAsPaid(id: string, userId: string): Promise<void> {
    const { error } = await supabase.from('transactions').update({ payment_status: 'paid' }).eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message || 'Failed to update transaction');
  }

  async deleteTransaction(id: string, userId: string): Promise<void> {
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId); 
    if (error) throw new Error(error.message || 'Failed to delete transaction');
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
        const netQty = (Number(tx.quantity) || 0) - (Number(tx.deduction) || 0);
        if (tx.type === 'purchase') {
          stock += netQty;
          totalPurchased += netQty;
          // Calculate cost based on product part of transaction only (exclude extraAmount usually)
          // We subtract extraAmount from totalValue to get raw material cost
          const rawValue = (Number(tx.totalValue) || 0) - (Number(tx.extraAmount) || 0);
          totalCost += rawValue;
        } else {
          stock -= netQty;
        }
      });

      const avgCost = totalPurchased > 0 ? totalCost / totalPurchased : 0;
      const status: 'ok' | 'low' | 'out' = stock <= 0 ? 'out' : stock < product.minStockLevel ? 'low' : 'ok';
      return { 
        ...product, 
        stock: Number(stock), 
        avgCost: Number(avgCost), 
        totalValue: Number(stock * avgCost), 
        status 
      };
    });
  }
}

export const dbService = isSupabaseConfigured ? new SupabaseService() : mockDbService;