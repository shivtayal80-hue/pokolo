import React, { useState } from 'react';
import { Plus, Search, AlertCircle, Download, MoreHorizontal } from 'lucide-react';
import { Card, Button } from './ui/LayoutComponents';
import { Modal } from './ui/Modal';
import { InventoryItem, Product } from '../types';
import { dbService } from '../services/db';
import * as XLSX from 'xlsx';

interface InventoryProps {
  inventory: InventoryItem[];
  userId: string;
  onRefresh: () => void;
}

const UNIT_TYPES = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'm', 'cm'];

export const Inventory: React.FC<InventoryProps> = ({ inventory, userId, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', category: '', minStockLevel: 10, unit: 'kg' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredItems = inventory.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportExcel = () => {
    const data = filteredItems.map(item => ({
      'Product Name': item.name,
      'Category': item.category,
      'Current Stock': item.stock,
      'Unit': item.unit,
      'Avg Cost': item.avgCost,
      'Total Value': item.totalValue,
      'Status': item.status.toUpperCase()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `Fintrack_Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await dbService.addProduct(newProduct, userId);
      setIsModalOpen(false);
      setNewProduct({ name: '', category: '', minStockLevel: 10, unit: 'kg' });
      onRefresh();
    } catch (err) {
      console.error(err);
      alert("Failed to add product.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:placeholder-gray-300 focus:ring-2 focus:ring-gray-100 focus:border-gray-300 sm:text-sm transition-all hover:border-gray-300"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
           <Button variant="secondary" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0 border-none shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">In Stock</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Cost</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Value</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredItems.map((item, idx) => (
                <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.category}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right font-medium">
                    {item.stock.toLocaleString()} <span className="text-gray-400 text-xs font-normal ml-0.5">{item.unit}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {'\u20B9'}{item.avgCost.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">{'\u20B9'}{item.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize border
                      ${item.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : ''}
                      ${item.status === 'low' ? 'bg-amber-50 text-amber-700 border-amber-100' : ''}
                      ${item.status === 'out' ? 'bg-red-50 text-red-700 border-red-100' : ''}
                    `}>
                      {item.status === 'low' && <AlertCircle className="w-3 h-3 mr-1.5" />}
                      {item.status === 'out' ? 'Out of Stock' : item.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No products found matching "{searchTerm}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="New Product"
      >
        <form onSubmit={handleAddProduct} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input 
              required
              type="text" 
              className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
              value={newProduct.name}
              onChange={e => setNewProduct({...newProduct, name: e.target.value})}
              placeholder="e.g. Arabica Beans"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input 
              required
              type="text" 
              className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
              value={newProduct.category}
              onChange={e => setNewProduct({...newProduct, category: e.target.value})}
              placeholder="e.g. Raw Material"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
              <select
                className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                value={newProduct.unit}
                onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
              >
                {UNIT_TYPES.map(u => (
                  <option key={u} value={u}>{u.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Alert</label>
              <input 
                required
                type="number" 
                min="0"
                className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                value={newProduct.minStockLevel}
                onChange={e => setNewProduct({...newProduct, minStockLevel: parseInt(e.target.value)})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Create Product</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};