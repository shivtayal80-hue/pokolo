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
    tx: Omit<Transaction, 'id' | 'totalValue' | 'productName' | 'unit' | 'userId' | 'paymentStatus' | 'dueDate'> & { creditPeriod?: number }, 
    products: Product[],
    userId: string
  ): Promise<Transaction> {
    const product = products.find(p => p.id === tx.productId);
    if (!product) throw new Error("Product not found");

    const grossQty = Number(tx.quantity) || 0;
    const deductionAmt = Number(tx.deduction) || 0;
    const extraAmount = Number(tx.extraAmount) || 0;
    
    const netQuantity = grossQty - deductionAmt;
    const totalValue = (netQuantity * (Number(tx.pricePerUnit) || 0)) + extraAmount;

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

    // Explicitly mapping deduction to match DB schema exactly as requested
    const { data, error } = await supabase.from('transactions').insert([{
      user_id: userId,
      product_id: tx.productId,
      product_name: product.name,
      type: tx.type,
      party_name: tx.partyName,
      quantity: grossQty,
      deduction: deductionAmt, 
      deduction_reason: tx.deductionReason || null,
      
      extra_amount: extraAmount,
      extra_reason: tx.extraReason || null,

      unit: product.unit,
      price_per_unit: tx.pricePerUnit,
      total_value: totalValue,
      date: tx.date,
      payment_type: tx.paymentType,
      payment_status: paymentStatus,
      due_date: dueDate,
      credit_period: tx.creditPeriod
    }]).select().single();

    // Ensure we throw an Error object with a message, not the raw Supabase object
    if (error) {
       const errMsg = error.message || error.details || error.hint || 'Transaction creation failed';
       throw new Error(errMsg);
    }
    
    return {
      id: safeString(data.id),
      userId: safeString(data.user_id),
      productId: safeString(data.product_id),
      productName: safeString(data.product_name),
      type: data.type,
      partyName: safeString(data.party_name),
      quantity: Number(data.quantity),
      deduction: Number(data.deduction),
      deductionReason: data.deduction_reason ? safeString(data.deduction_reason) : undefined,
      
      extraAmount: Number(data.extra_amount),
      extraReason: data.extra_reason ? safeString(data.extra_reason) : undefined,

      unit: safeString(data.unit),
      pricePerUnit: Number(data.price_per_unit),
      totalValue: Number(data.total_value),
      date: safeString(data.date),
      paymentType: data.payment_type,
      paymentStatus: data.payment_status,
      dueDate: data.due_date ? safeString(data.due_date) : undefined,
      creditPeriod: data.credit_period ? Number(data.credit_period) : undefined
    };
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
          // Calculate cost based on product part of transaction only, 
          // generally we want Average Cost of Goods to reflect price per unit + allocated extras?
          // For simplicity, we keep avgCost as pure material cost per unit (pricePerUnit).
          // Extra amounts are usually overheads.
          totalCost += (netQty * (Number(tx.pricePerUnit) || 0));
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