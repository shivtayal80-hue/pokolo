import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Package, ArrowRightLeft, Menu, Box, LogOut, Command, Bell, Activity, Wifi, Share, X } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Transactions } from './components/Transactions';
import { AuthScreen } from './components/AuthScreen';
import { dbService } from './services/db'; 
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { InventoryItem, Transaction, Product, User } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'inventory' | 'transactions'>('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [showIosInstall, setShowIosInstall] = useState(false);

  // App Data
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // 1. Auth Listener
  useEffect(() => {
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.email?.split('@')[0] || 'User',
            role: 'admin'
          });
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.email?.split('@')[0] || 'User',
            role: 'admin'
          });
        } else {
          setUser(null);
          clearData();
        }
      });
      return () => subscription.unsubscribe();
    } else {
      const storedUser = localStorage.getItem('fintrack_active_user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    }
  }, []);

  // Check for iOS and Standalone mode
  useEffect(() => {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    
    if (isIos && !isStandalone) {
      // Small delay to not be intrusive immediately
      const timer = setTimeout(() => setShowIosInstall(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const clearData = () => {
    setInventory([]);
    setTransactions([]);
    setProducts([]);
  };

  // 2. Data Fetching & Real-time Subscription
  const fetchData = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const [invData, txData, prodData] = await Promise.all([
        dbService.getInventorySummary(user.id),
        dbService.getTransactions(user.id),
        dbService.getProducts(user.id)
      ]);
      setInventory(invData);
      setTransactions(txData); 
      setProducts(prodData);
    } catch (e) {
      console.error("Failed to load data", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      // Initial Fetch
      fetchData();
      setIsLive(true);

      // Setup Real-time Subscription (works for both Mock and Supabase)
      const unsubscribe = dbService.subscribe(user.id, () => {
        console.log("Real-time update received");
        fetchData(); // Hot reload data on change
      });

      return () => {
        setIsLive(false);
        unsubscribe();
      };
    }
  }, [user]);

  const handleLogout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem('fintrack_active_user');
      setUser(null);
      clearData();
    }
    setCurrentView('dashboard');
  };

  const handleMockLogin = (user: User) => {
    localStorage.setItem('fintrack_active_user', JSON.stringify(user));
    setUser(user);
  };

  if (!user) {
    return <AuthScreen onLogin={handleMockLogin} />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'transactions', label: 'Transactions', icon: ArrowRightLeft },
  ];

  return (
    <div className="flex h-screen bg-[#F9FAFB] overflow-hidden text-gray-900 font-sans selection:bg-brand-100 selection:text-brand-900 relative">
      
      {/* iOS Install Prompt Banner */}
      {showIosInstall && (
        <div className="fixed bottom-4 left-4 right-4 z-50 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-gray-100 animate-in slide-in-from-bottom duration-500">
          <div className="flex items-start gap-4">
            <div className="bg-gray-100 p-2 rounded-xl">
              <Share className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900">Install App</h3>
              <p className="text-sm text-gray-600 mt-1">
                Tap <Share className="inline w-3 h-3 mx-1" /> and select <span className="font-semibold">"Add to Home Screen"</span> to install on your iPhone.
              </p>
            </div>
            <button 
              onClick={() => setShowIosInstall(false)}
              className="p-1 text-gray-400 hover:text-gray-900"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/20 z-20 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Modern Light Theme */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-72 bg-white border-r border-gray-100 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white">
             <Command size={16} strokeWidth={3} />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900">FINTRACK</span>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as any);
                setSidebarOpen(false);
              }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                ${currentView === item.id 
                  ? 'bg-gray-50 text-gray-900 shadow-sm ring-1 ring-gray-200' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}
              `}
            >
              <item.icon size={18} className={currentView === item.id ? 'text-gray-900' : 'text-gray-400'} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group cursor-pointer">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600 shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{user.role}</p>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); handleLogout(); }}
              className="text-gray-400 hover:text-red-500 transition-colors p-1.5 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Modern Header */}
        <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 h-16 flex items-center justify-between px-6 lg:px-8 z-10 sticky top-0">
          <div className="flex items-center gap-4">
             <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-md lg:hidden"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900 capitalize tracking-tight">{currentView}</h1>
          </div>
          
          <div className="flex items-center gap-4">
            
            {/* Real-time Indicator */}
            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isLive ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-gray-100 text-gray-500'}`}>
              <div className="relative flex h-2 w-2">
                {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
              </div>
              {isLive ? 'Live Sync Active' : 'Offline'}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {isLoading && <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-1 rounded-full animate-pulse">Syncing...</span>}
              <div className="h-4 w-px bg-gray-200 mx-2"></div>
              <span className="text-sm font-medium text-gray-500">
                {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <button className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-50 rounded-full transition-colors relative">
               <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full border border-white"></div>
               <Bell size={20} />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {currentView === 'dashboard' && (
              <Dashboard 
                inventory={inventory} 
                transactions={transactions} 
                userRole={user.role} 
                onNavigate={(view) => setCurrentView(view)}
              />
            )}
            
            {currentView === 'inventory' && (
              <Inventory 
                inventory={inventory} 
                userId={user.id} 
                onRefresh={fetchData} 
              />
            )}
            
            {currentView === 'transactions' && (
              <Transactions 
                transactions={transactions} 
                products={products} 
                inventory={inventory}
                userRole={user.role}
                userId={user.id} 
                onRefresh={fetchData} 
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;