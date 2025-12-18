import React from 'react';

export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  email: string; // Used as username
  name: string;
  role: UserRole;
  password?: string; // Only used for mock auth check
}

export interface Product {
  id: string;
  userId: string; // Link product to specific user (RLS)
  name: string;
  category: string;
  minStockLevel: number;
  unit: string; // 'kg', 'pcs', 'l', 'm', etc.
}

export interface Transaction {
  id: string;
  userId: string;
  productId: string;
  productName: string; 
  type: 'purchase' | 'sale';
  partyName: string; 
  quantity: number; // Renamed from quantityKg
  unit: string; // Snapshot of unit at time of transaction
  pricePerUnit: number; // Renamed from pricePerKg
  totalValue: number;
  date: string;
  
  // Credit & Lifecycle Management
  paymentType: 'cash' | 'credit';
  creditPeriod?: number; // Days
  dueDate?: string; // ISO Date
  paymentStatus: 'paid' | 'pending' | 'overdue';
}

export interface InventoryItem extends Product {
  stock: number; // Renamed from stockKg
  avgCost: number; // Renamed from avgCostPerKg
  totalValue: number;
  status: 'ok' | 'low' | 'out';
}

export interface DashboardMetrics {
  totalRevenue: number;
  totalProfit: number; 
  totalStockValue: number;
  lowStockCount: number;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}