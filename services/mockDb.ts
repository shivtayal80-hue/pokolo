import { Product, Transaction, InventoryItem, User, BackupData } from '../types';
import { safeString } from '../lib/utils';

// Initial Mock Data - Assigned to the default 'admin-1' user
const INITIAL_PRODUCTS: Product[] = [
  { id: 'p-1', userId: 'admin-1', name: 'Arabica Coffee Beans', category: 'Raw Material', minStockLevel: 50, unit: 'kg' },
  { id: 'p-2', userId: 'admin-1', name: 'Vanilla Extract', category: 'Additive', minStockLevel: 10, unit: 'l' },
  { id: 'p-3', userId: 'admin-1', name: 'Cardboard Boxes', category: 'Packaging', minStockLevel: 100, unit: 'pcs' },
];

const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 't-1',
    userId: 'admin-1',
    productId: 'p-1',
    productName: 'Arabica Coffee Beans',
    type: 'purchase',
    partyName: 'Global Beans Co.',
    quantity: 500,
    deduction: 10,
    deductionReason: 'Moisture Loss',
    unit: 'kg',
    pricePerUnit: 12.50,
    totalValue: 6125, // (500-10) * 12.50
    date: new Date(Date.now() - 86400000 * 5).toISOString(),
    paymentType: 'credit',
    creditPeriod: 30,
    dueDate: new Date(Date.now() + 86400000 * 25).toISOString(), // Due in 25 days
    paymentStatus: 'pending'
  }
];

const INITIAL_USERS: User[] = [
  { id: 'admin-1', name: 'Admin User', email: 'admin', password: 'password', role: 'admin' }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MockDBService {
  private syncChannel: BroadcastChannel;

  constructor() {
    this.syncChannel = new BroadcastChannel('fintrack_realtime_sync');
  }

  private getStorage<T>(key: string, initial: T): T {
    try {
      const stored = localStorage.getItem(`fintrack_${key}`);
      return stored ? JSON.parse(stored) : initial;
    } catch (e) {
      return initial;
    }
  }

  private setStorage<T>(key: string, value: T): void {
    localStorage.setItem(`fintrack_${key}`, JSON.stringify(value));
  }

  private broadcastUpdate() {
    this.syncChannel.postMessage({ type: 'DB_UPDATE' });
  }

  subscribe(userId: string, onUpdate: () => void): () => void {
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'DB_UPDATE') onUpdate();
    };
    this.syncChannel.addEventListener('message', handler);
    return () => this.syncChannel.removeEventListener('message', handler);
  }

  exportDatabase(): BackupData {
    return {
      users: this.getStorage('users', INITIAL_USERS),
      products: this.getStorage('products', INITIAL_PRODUCTS),
      transactions: this.getStorage('transactions', INITIAL_TRANSACTIONS),
      timestamp: Date.now()
    };
  }

  importDatabase(data: BackupData): boolean {
    try {
      this.setStorage('users', data.users);
      this.setStorage('products', data.products);
      this.setStorage('transactions', data.transactions);
      this.broadcastUpdate();
      return true;
    } catch (e) {
      return false;
    }
  }

  async login(username: string, password: string): Promise<User> {
    await delay(500);
    const users = this.getStorage('users', INITIAL_USERS);
    const user = users.find(u => u.email.toLowerCase() === username.toLowerCase().trim() && u.password === password);
    if (!user) throw new Error("Credentials not found.");
    const { password: _, ...safeUser } = user;
    return {
        ...safeUser,
        id: safeString(safeUser.id),
        name: safeString(safeUser.name),
        email: safeString(safeUser.email),
        role: safeUser.role
    };
  }

  async register(username: string, password: string): Promise<User> {
    await delay(500);
    const users = this.getStorage('users', INITIAL_USERS);
    if (users.find(u => u.email.toLowerCase() === username.toLowerCase().trim())) throw new Error("Username already exists");
    const newUser: User = { id: `u-${Date.now()}`, email: username.toLowerCase().trim(), name: username.trim(), password, role: 'admin' };
    this.setStorage('users', [...users, newUser]);
    const { password: _, ...safeUser } = newUser;
    return safeUser;
  }

  async getProducts(userId: string): Promise<Product[]> {
    const products = this.getStorage<Product[]>('products', INITIAL_PRODUCTS).filter(p => p.userId === userId);
    return products.map(p => ({
        id: safeString(p.id),
        userId: safeString(p.userId),
        name: safeString(p.name),
        category: safeString(p.category),
        minStockLevel: Number(p.minStockLevel) || 0,
        unit: safeString(p.unit)
    }));
  }

  async addProduct(product: Omit<Product, 'id' | 'userId'>, userId: string): Promise<Product> {
    const products = this.getStorage<Product[]>('products', INITIAL_PRODUCTS);
    const newProduct: Product = { 
        id: `p-${Date.now()}`, 
        userId,
        name: safeString(product.name),
        category: safeString(product.category),
        minStockLevel: Number(product.minStockLevel),
        unit: safeString(product.unit)
    };
    this.setStorage('products', [...products, newProduct]);
    this.broadcastUpdate();
    return newProduct;
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    const all = this.getStorage<Transaction[]>('transactions', INITIAL_TRANSACTIONS);
    const now = new Date();
    const updated = all.map(t => (t.paymentStatus === 'pending' && t.dueDate && new Date(t.dueDate) < now) ? { ...t, paymentStatus: 'overdue' as const } : t);
    return updated.filter(t => t.userId === userId).map(t => ({
        id: safeString(t.id),
        userId: safeString(t.userId),
        productId: safeString(t.productId),
        productName: safeString(t.productName),
        type: t.type,
        partyName: safeString(t.partyName),
        quantity: Number(t.quantity) || 0,
        deduction: Number(t.deduction) || 0,
        deductionReason: t.deductionReason ? safeString(t.deductionReason) : undefined,
        unit: safeString(t.unit),
        pricePerUnit: Number(t.pricePerUnit) || 0,
        totalValue: Number(t.totalValue) || 0,
        date: safeString(t.date),
        paymentType: t.paymentType,
        creditPeriod: Number(t.creditPeriod) || 0,
        dueDate: t.dueDate ? safeString(t.dueDate) : undefined,
        paymentStatus: t.paymentStatus
    }));
  }

  async addTransaction(
    tx: Omit<Transaction, 'id' | 'totalValue' | 'productName' | 'unit' | 'userId' | 'paymentStatus' | 'dueDate'> & { creditPeriod?: number }, 
    products: Product[],
    userId: string
  ): Promise<Transaction> {
    const transactions = this.getStorage<Transaction[]>('transactions', INITIAL_TRANSACTIONS);
    const product = products.find(p => p.id === tx.productId);
    if (!product) throw new Error("Product not found");

    const netQuantity = (Number(tx.quantity) || 0) - (Number(tx.deduction) || 0);
    const totalValue = netQuantity * (Number(tx.pricePerUnit) || 0);

    let dueDate: string | undefined;
    let paymentStatus: 'paid' | 'pending' | 'overdue' = 'paid';
    if (tx.paymentType === 'credit') {
      paymentStatus = 'pending';
      if (tx.creditPeriod) {
        const d = new Date(tx.date);
        d.setDate(d.getDate() + (Number(tx.creditPeriod) || 0));
        dueDate = d.toISOString();
      }
    }

    const newTx: Transaction = {
      id: `t-${Date.now()}`,
      userId,
      productId: safeString(tx.productId),
      productName: safeString(product.name),
      type: tx.type,
      partyName: safeString(tx.partyName),
      quantity: Number(tx.quantity),
      deduction: Number(tx.deduction),
      deductionReason: tx.deductionReason ? safeString(tx.deductionReason) : undefined,
      unit: safeString(product.unit),
      pricePerUnit: Number(tx.pricePerUnit),
      totalValue,
      date: safeString(tx.date),
      paymentType: tx.paymentType,
      creditPeriod: Number(tx.creditPeriod),
      dueDate,
      paymentStatus
    };

    this.setStorage('transactions', [newTx, ...transactions]);
    this.broadcastUpdate();
    return newTx;
  }

  async markTransactionAsPaid(id: string, userId: string): Promise<void> {
    const all = this.getStorage<Transaction[]>('transactions', INITIAL_TRANSACTIONS);
    this.setStorage('transactions', all.map(t => (t.id === id && t.userId === userId) ? { ...t, paymentStatus: 'paid' as const } : t));
    this.broadcastUpdate();
  }

  async deleteTransaction(id: string, userId: string): Promise<void> {
    const all = this.getStorage<Transaction[]>('transactions', INITIAL_TRANSACTIONS);
    this.setStorage('transactions', all.filter(t => t.id !== id || t.userId !== userId));
    this.broadcastUpdate();
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
          totalCost += (netQty * (Number(tx.pricePerUnit) || 0));
        } else {
          stock -= netQty;
        }
      });

      const avgCost = totalPurchased > 0 ? totalCost / totalPurchased : 0;
      const status = stock <= 0 ? 'out' : stock < product.minStockLevel ? 'low' : 'ok';
      return { ...product, stock, avgCost, totalValue: stock * avgCost, status };
    });
  }
}

export const dbService = new MockDBService();