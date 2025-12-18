import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { DollarSign, Package, TrendingUp, AlertTriangle, ClipboardList, Clock, ArrowDown, ArrowUp } from 'lucide-react';
import { StatCard, Card } from './ui/LayoutComponents';
import { InventoryItem, Transaction, UserRole } from '../types';

interface DashboardProps {
  inventory: InventoryItem[];
  transactions: Transaction[];
  userRole: UserRole;
  onNavigate?: (view: 'inventory' | 'transactions') => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ inventory, transactions, userRole, onNavigate }) => {
  
  const metrics = useMemo(() => {
    const totalRevenue = transactions
      .filter(t => t.type === 'sale')
      .reduce((sum, t) => sum + t.totalValue, 0);
    
    const totalPurchases = transactions
      .filter(t => t.type === 'purchase')
      .reduce((sum, t) => sum + t.totalValue, 0);

    const totalStockValue = inventory.reduce((sum, item) => sum + item.totalValue, 0);
    const lowStockCount = inventory.filter(i => i.status !== 'ok').length;

    // Credit Metrics
    const accountsReceivable = transactions
      .filter(t => t.type === 'sale' && t.paymentStatus !== 'paid')
      .reduce((sum, t) => sum + t.totalValue, 0);
      
    const accountsPayable = transactions
      .filter(t => t.type === 'purchase' && t.paymentStatus !== 'paid')
      .reduce((sum, t) => sum + t.totalValue, 0);

    return {
      totalRevenue,
      totalPurchases,
      grossProfit: totalRevenue - (totalPurchases - totalStockValue),
      totalStockValue,
      lowStockCount,
      accountsReceivable,
      accountsPayable
    };
  }, [inventory, transactions]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const dayTransactions = transactions.filter(t => t.date.startsWith(date) && t.type === 'sale');
      const dayTotal = dayTransactions.reduce((sum, t) => sum + t.totalValue, 0);
      return {
        date: date.slice(5),
        sales: dayTotal
      };
    });
  }, [transactions]);

  if (inventory.length === 0 && transactions.length === 0) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="bg-white border border-gray-100 rounded-3xl p-12 text-center mb-8 relative overflow-hidden shadow-sm">
           <div className="relative z-10 max-w-lg mx-auto">
             <div className="inline-flex items-center justify-center p-4 bg-gray-50 rounded-2xl mb-6">
               <Package className="w-8 h-8 text-gray-900" strokeWidth={1.5} />
             </div>
             <h2 className="text-2xl font-bold mb-4 text-gray-900 tracking-tight">Let's get started</h2>
             <p className="text-gray-500 text-lg mb-8 leading-relaxed">
               Your inventory is empty. Add your first product or record a purchase to see your dashboard come to life.
             </p>
             <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => onNavigate?.('inventory')}
                  className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-black transition-colors flex items-center justify-center gap-2"
                >
                  <Package size={20} />
                  Add First Product
                </button>
                <button 
                  onClick={() => onNavigate?.('transactions')}
                  className="px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <ClipboardList size={20} />
                  Log Purchase
                </button>
             </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Credit Lifecycle Summary */}
      {(metrics.accountsReceivable > 0 || metrics.accountsPayable > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-card border-l-4 border-emerald-500">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <ArrowDown size={20} />
                </div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Accounts Receivable</h3>
              </div>
              <Clock size={16} className="text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{'\u20B9'}{metrics.accountsReceivable.toLocaleString()}</span>
              <span className="text-sm text-gray-500">pending collection</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-card border-l-4 border-amber-500">
             <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                  <ArrowUp size={20} />
                </div>
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Accounts Payable</h3>
              </div>
              <Clock size={16} className="text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{'\u20B9'}{metrics.accountsPayable.toLocaleString()}</span>
              <span className="text-sm text-gray-500">pending repayment</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Revenue" 
          value={`\u20B9${metrics.totalRevenue.toLocaleString()}`} 
          icon={DollarSign} 
          colorClass="text-emerald-600"
        />
        {userRole === 'admin' && (
          <StatCard 
            title="Gross Profit" 
            value={`\u20B9${metrics.grossProfit.toLocaleString()}`} 
            subValue="Est. Revenue - COGS"
            icon={TrendingUp} 
            colorClass="text-gray-900"
          />
        )}
        <StatCard 
          title="Inventory Value" 
          value={`\u20B9${metrics.totalStockValue.toLocaleString()}`} 
          icon={Package} 
          colorClass="text-brand-600"
        />
        <StatCard 
          title="Low Stock Alerts" 
          value={metrics.lowStockCount.toString()} 
          subValue="Items requiring attention"
          icon={AlertTriangle} 
          colorClass={metrics.lowStockCount > 0 ? "text-amber-500" : "text-gray-400"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Sales Trend">
          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#111827" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#111827" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  stroke="#9CA3AF" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                />
                <YAxis 
                  stroke="#9CA3AF" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `\u20B9${value}`} 
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: '#111827', fontWeight: 600 }}
                  cursor={{ stroke: '#E5E7EB', strokeWidth: 1 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#111827" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorSales)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Inventory Distribution">
           <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inventory.slice(0, 5)} layout="vertical" barSize={32}>
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={120} 
                  stroke="#6B7280" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  cursor={{fill: '#F3F4F6', radius: 4}} 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} 
                />
                <Bar dataKey="stock" fill="#0EA5E9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
};