import { Product, Transaction, InventoryItem, User } from '../types';

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
    unit: 'kg',
    pricePerUnit: 12.50,
    totalValue: 6250,
    date: new Date(Date.now() - 86400000 * 5).toISOString(),
    paymentType: 'credit',
    creditPeriod: 30,
    dueDate: new Date(Date.now() + 86400000 * 25).toISOString(), // Due in 25 days
    paymentStatus: 'pending'
  },
  {
    id: 't-2',
    userId: 'admin-1',
    productId: 'p-1',
    productName: 'Arabica Coffee Beans',
    type: 'sale',
    partyName: 'Morning Brew Café',
    quantity: 50,
    unit: 'kg',
    pricePerUnit: 25.00,
    totalValue: 1250,
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    paymentType: 'cash',
    paymentStatus: 'paid'
  }
];

const INITIAL_USERS: User[] = [
  { id: 'admin-1', name: 'Admin User', email: 'admin', password: 'password', role: 'admin' }
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MockDBService {
  private syncChannel: BroadcastChannel;

  constructor() {
    // Simulates WebSockets for Demo Mode: Syncs across tabs
    this.syncChannel = new BroadcastChannel('fintrack_realtime_sync');
  }

  private getStorage<T>(key: string, initial: T): T {
    const stored = localStorage.getItem(`fintrack_${key}`);
    return stored ? JSON.parse(stored) : initial;
  }

  private setStorage<T>(key: string, value: T): void {
    localStorage.setItem(`fintrack_${key}`, JSON.stringify(value));
  }

  private broadcastUpdate() {
    this.syncChannel.postMessage({ type: 'DB_UPDATE' });
  }

  // --- Real-time Subscription ---
  subscribe(userId: string, onUpdate: () => void): () => void {
    const handler = (event: MessageEvent) => {
      if (event.data.type === 'DB_UPDATE') {
        onUpdate();
      }
    };
    this.syncChannel.addEventListener('message', handler);
    return () => this.syncChannel.removeEventListener('message', handler);
  }

  // --- Auth ---
  async login(username: string, password: string): Promise<User> {
    await delay(500);
    const users = this.getStorage('users', INITIAL_USERS);
    const user = users.find(u => u.email === username && u.password === password);
    if (!user) throw new Error("Invalid credentials");
    // Return user without password
    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  async register(username: string, password: string): Promise<User> {
    await delay(500);
    const users = this.getStorage('users', INITIAL_USERS);
    
    if (users.find(u => u.email === username)) {
      throw new Error("Username already exists");
    }

    const newUser: User = {
      id: `u-${Date.now()}`,
      email: username,
      name: username, // Default name to username
      password: password,
      role: 'admin' // Default to admin for this mini-erp
    };

    this.setStorage('users', [...users, newUser]);
    const { password: _, ...safeUser } = newUser;
    return safeUser;
  }

  // --- Products (RLS Implemented) ---
  async getProducts(userId: string): Promise<Product[]> {
    await delay(300);
    const allProducts = this.getStorage('products', INITIAL_PRODUCTS);
    // RLS: Only return products belonging to the user
    return allProducts.filter(p => p.userId === userId);
  }

  async addProduct(product: Omit<Product, 'id' | 'userId'>, userId: string): Promise<Product> {
    await delay(300);
    const products = this.getStorage('products', INITIAL_PRODUCTS);
    const newProduct: Product = { 
      ...product, 
      id: `p-${Date.now()}`,
      userId: userId // Assign ownership
    };
    this.setStorage('products', [...products, newProduct]);
    this.broadcastUpdate(); // Trigger Sync
    return newProduct;
  }

  // --- Transactions (RLS Implemented) ---
  async getTransactions(userId: string): Promise<Transaction[]> {
    await delay(300);
    const allTransactions = this.getStorage('transactions', INITIAL_TRANSACTIONS);
    
    // Auto-update overdue status on fetch
    const now = new Date();
    const updatedTransactions = allTransactions.map(t => {
      if (t.paymentStatus === 'pending' && t.dueDate && new Date(t.dueDate) < now) {
        return { ...t, paymentStatus: 'overdue' as const };
      }
      return t;
    });

    // Save if any statuses changed (optimization skipped for mock)
    this.setStorage('transactions', updatedTransactions);

    return updatedTransactions.filter(t => t.userId === userId);
  }

  async addTransaction(
    tx: Omit<Transaction, 'id' | 'totalValue' | 'productName' | 'unit' | 'userId' | 'paymentStatus' | 'dueDate'> & { creditPeriod?: number }, 
    products: Product[],
    userId: string
  ): Promise<Transaction> {
    await delay(500);
    const transactions = this.getStorage('transactions', INITIAL_TRANSACTIONS);
    
    const product = products.find(p => p.id === tx.productId && p.userId === userId);
    if (!product) throw new Error("Product not found or access denied");

    // Lifecycle Logic
    let dueDate: string | undefined;
    let paymentStatus: 'paid' | 'pending' | 'overdue' = 'paid';

    if (tx.paymentType === 'credit') {
      paymentStatus = 'pending';
      if (tx.creditPeriod) {
        const date = new Date(tx.date);
        date.setDate(date.getDate() + tx.creditPeriod);
        dueDate = date.toISOString();
      }
    }

    const newTx: Transaction = {
      ...tx,
      id: `t-${Date.now()}`,
      userId: userId,
      productName: product.name,
      unit: product.unit,
      totalValue: tx.quantity * tx.pricePerUnit,
      paymentStatus,
      dueDate
    };

    this.setStorage('transactions', [newTx, ...transactions]);
    this.broadcastUpdate();
    return newTx;
  }

  async markTransactionAsPaid(id: string, userId: string): Promise<void> {
    await delay(300);
    const transactions = this.getStorage('transactions', INITIAL_TRANSACTIONS);
    const updated = transactions.map(t => {
      if (t.id === id && t.userId === userId) {
        return { ...t, paymentStatus: 'paid' as const };
      }
      return t;
    });
    this.setStorage('transactions', updated);
    this.broadcastUpdate();
  }

  async deleteTransaction(id: string, userId: string): Promise<void> {
    await delay(300);
    const transactions = this.getStorage('transactions', INITIAL_TRANSACTIONS);
    const txToDelete = transactions.find(t => t.id === id);
    if (!txToDelete || txToDelete.userId !== userId) {
      throw new Error("Transaction not found or access denied");
    }
    this.setStorage('transactions', transactions.filter(t => t.id !== id));
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

export const dbService = new MockDBService();