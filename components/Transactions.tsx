import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, FileText, Trash2, Download, Plus, Check, Clock, AlertTriangle } from 'lucide-react';
import { Card, Button } from './ui/LayoutComponents';
import { Modal } from './ui/Modal';
import { Product, Transaction, UserRole, InventoryItem } from '../types';
import { dbService } from '../services/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface TransactionsProps {
  transactions: Transaction[];
  products: Product[];
  inventory: InventoryItem[];
  userRole: UserRole;
  userId: string;
  onRefresh: () => void | Promise<void>;
}

const UNIT_TYPES = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'm', 'cm'];

export const Transactions: React.FC<TransactionsProps> = ({ transactions, products, inventory, userRole, userId, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'history' | 'purchase' | 'sale'>('history');
  
  // Transaction Form State
  const [formData, setFormData] = useState({
    productId: '',
    partyName: '',
    quantity: '',
    pricePerUnit: '',
    date: new Date().toISOString().split('T')[0],
    paymentType: 'cash' as 'cash' | 'credit',
    creditPeriod: '30' // Default 30 days
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);

  // New Product Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', category: '', minStockLevel: 10, unit: 'kg' });
  const [isProductSubmitting, setIsProductSubmitting] = useState(false);

  const suppliers = Array.from(new Set(transactions.filter(t => t.type === 'purchase').map(t => t.partyName)));
  const receivers = Array.from(new Set(transactions.filter(t => t.type === 'sale').map(t => t.partyName)));

  const selectedProduct = products.find(p => p.id === formData.productId);
  const currentUnit = selectedProduct ? selectedProduct.unit : 'units';

  const handleTransaction = async (e: React.FormEvent, type: 'purchase' | 'sale') => {
    e.preventDefault();
    if (type === 'sale') {
      const item = inventory.find(i => i.id === formData.productId);
      if (!item || item.stock < parseFloat(formData.quantity)) {
        alert(`Insufficient stock! Current stock: ${item?.stock} ${item?.unit}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await dbService.addTransaction({
        productId: formData.productId,
        type,
        partyName: formData.partyName,
        quantity: parseFloat(formData.quantity),
        pricePerUnit: parseFloat(formData.pricePerUnit),
        date: formData.date,
        paymentType: formData.paymentType,
        creditPeriod: formData.paymentType === 'credit' ? parseInt(formData.creditPeriod) : undefined
      }, products, userId);
      
      setFormData({ 
        productId: '', 
        partyName: '', 
        quantity: '', 
        pricePerUnit: '',
        date: new Date().toISOString().split('T')[0],
        paymentType: 'cash',
        creditPeriod: '30'
      });
      setActiveTab('history');
      onRefresh();
    } catch (error) {
      console.error(error);
      alert("Failed to process transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (txId: string) => {
    if (confirm("Mark this transaction as settled/paid?")) {
      try {
        await dbService.markTransactionAsPaid(txId, userId);
        onRefresh();
      } catch (err) {
        alert("Failed to update status");
      }
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProductSubmitting(true);
    try {
      const addedProduct = await dbService.addProduct(newProduct, userId);
      setNewProduct({ name: '', category: '', minStockLevel: 10, unit: 'kg' });
      setIsProductModalOpen(false);
      await onRefresh();
      setFormData(prev => ({ ...prev, productId: addedProduct.id }));
    } catch (err) {
      console.error(err);
      alert("Failed to add product");
    } finally {
      setIsProductSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure? This will revert stock levels.")) {
      try {
        await dbService.deleteTransaction(id, userId);
        onRefresh();
      } catch (err) {
        alert("Cannot delete this transaction.");
      }
    }
  };

  const handleExportExcel = () => {
    const data = transactions.map(t => ({
      Date: new Date(t.date).toLocaleDateString(),
      Type: t.type.toUpperCase(),
      ID: t.id,
      Product: t.productName,
      Party: t.partyName,
      Quantity: t.quantity,
      Unit: t.unit,
      'Price/Unit': t.pricePerUnit,
      'Total Value': t.totalValue,
      'Payment': t.paymentType.toUpperCase(),
      'Status': t.paymentStatus.toUpperCase(),
      'Due Date': t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `Fintrack_Transactions_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const generatePDF = (tx: Transaction) => {
    setPdfGenerating(tx.id);
    try {
      const doc = new jsPDF();
      doc.setFillColor(17, 24, 39); // Gray 900
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("FINTRACK", 15, 26);
      
      doc.setFontSize(20);
      const title = tx.type === 'sale' ? "INVOICE" : "PURCHASE ORDER";
      doc.text(title, 195, 26, { align: 'right' });

      doc.setTextColor(0, 0, 0);
      doc.setFillColor(249, 250, 251); 
      doc.roundedRect(15, 50, 180, 25, 2, 2, 'FD');

      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128); 
      doc.text("TRANSACTION ID", 25, 60);
      doc.text("DATE", 85, 60);
      doc.text(tx.type === 'sale' ? "BILL TO" : "SUPPLIER", 145, 60);

      doc.setFontSize(11);
      doc.setTextColor(17, 24, 39); 
      doc.setFont("helvetica", "bold");
      doc.text(tx.id, 25, 68);
      doc.text(new Date(tx.date).toLocaleDateString(), 85, 68);
      doc.text(tx.partyName, 145, 68);

      const tableColumn = ["Item Description", "Quantity", "Unit Price", "Total"];
      const tableRows = [
        [
          tx.productName,
          `${tx.quantity} ${tx.unit}`,
          `INR ${tx.pricePerUnit.toLocaleString()}`,
          `INR ${tx.totalValue.toLocaleString()}`
        ]
      ];

      // @ts-ignore
      autoTable(doc, {
        startY: 85,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: { 
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          lineWidth: 0.1,
          lineColor: [229, 231, 235],
          fontStyle: 'bold',
          halign: 'left'
        },
        styles: {
          fontSize: 10,
          cellPadding: 8,
          textColor: [55, 65, 81],
          lineWidth: 0.1,
          lineColor: [229, 231, 235]
        },
        foot: [['', '', 'Grand Total', `INR ${tx.totalValue.toLocaleString()}`]],
        footStyles: { 
          fillColor: [249, 250, 251], 
          textColor: [17, 24, 39], 
          fontStyle: 'bold',
          halign: 'right'
        }
      });

      doc.save(`${tx.type}_invoice_${tx.id}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF.");
    } finally {
      setPdfGenerating(null);
    }
  };

  const getDaysRemaining = (dueDate: string) => {
    const diff = new Date(dueDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const renderForm = (type: 'purchase' | 'sale') => {
    const listId = `${type}-party-list`;
    const suggestions = type === 'purchase' ? suppliers : receivers;

    return (
      <Card title={`Record New ${type === 'purchase' ? 'Purchase (Inbound)' : 'Sale (Outbound)'}`} className="max-w-2xl mx-auto border-none shadow-card">
        <form onSubmit={(e) => handleTransaction(e, type)} className="space-y-5">
          {/* Payment Type Toggle */}
          <div className="bg-gray-100 p-1 rounded-xl flex mb-4">
            <button
              type="button"
              onClick={() => setFormData({...formData, paymentType: 'cash'})}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${formData.paymentType === 'cash' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Cash Payment
            </button>
            <button
              type="button"
              onClick={() => setFormData({...formData, paymentType: 'credit'})}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${formData.paymentType === 'credit' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Credit / Later
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className={`${formData.paymentType === 'credit' ? '' : 'sm:col-span-2'}`}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Date</label>
              <input 
                required
                type="date"
                className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>

            {formData.paymentType === 'credit' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Period (Days)</label>
                <div className="relative">
                   <Clock className="absolute top-2.5 left-3 h-4 w-4 text-gray-400" />
                   <input 
                    required
                    type="number"
                    min="1"
                    className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5 pl-9"
                    value={formData.creditPeriod}
                    onChange={e => setFormData({...formData, creditPeriod: e.target.value})}
                    placeholder="30"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
              <div className="flex gap-2">
                <select 
                  required
                  className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                  value={formData.productId}
                  onChange={e => setFormData({...formData, productId: e.target.value})}
                >
                  <option value="">Select Product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </select>
                {type === 'purchase' && (
                  <Button type="button" onClick={() => setIsProductModalOpen(true)} className="px-3" title="New">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {type === 'sale' && formData.productId && (
                <p className="text-xs text-gray-500 mt-2 ml-1">
                  Available Stock: <span className="font-medium text-gray-900">{inventory.find(i => i.id === formData.productId)?.stock.toLocaleString() || 0} {currentUnit}</span>
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {type === 'purchase' ? 'Supplier Name' : 'Receiver / Client'}
              </label>
              <input 
                required
                type="text"
                list={listId}
                className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                value={formData.partyName}
                onChange={e => setFormData({...formData, partyName: e.target.value})}
                placeholder={type === 'purchase' ? "e.g. Acme Corp" : "e.g. John Doe"}
              />
              <datalist id={listId}>
                {suggestions.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <div className="relative">
                <input 
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5 pr-12"
                  value={formData.quantity}
                  onChange={e => setFormData({...formData, quantity: e.target.value})}
                  placeholder="0.00"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span className="text-gray-400 text-sm">
                    {currentUnit}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {type === 'purchase' ? 'Cost Price' : 'Selling Price'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 text-sm">₹</span>
                </div>
                <input 
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5 pl-7"
                  value={formData.pricePerUnit}
                  onChange={e => setFormData({...formData, pricePerUnit: e.target.value})}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
            <Button type="button" variant="secondary" onClick={() => setActiveTab('history')}>Cancel</Button>
            <Button 
              type="submit" 
              isLoading={isSubmitting}
              className={type === 'sale' ? 'bg-emerald-600 hover:bg-emerald-700 border-none' : ''}
            >
              Confirm {type === 'purchase' ? 'Purchase' : 'Sale'}
            </Button>
          </div>
        </form>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        {/* Modern Tabs */}
        <div className="flex space-x-1 rounded-xl bg-gray-200/60 p-1 w-fit">
          {['history', 'sale', 'purchase'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`
                px-6 py-2 rounded-lg text-sm font-medium leading-5 transition-all
                ${activeTab === tab 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                }
              `}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'history' && (
          <Button variant="secondary" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        )}
      </div>

      {activeTab === 'history' && (
        <Card className="p-0 overflow-hidden border-none shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                        tx.type === 'purchase' 
                          ? 'bg-blue-50 text-blue-700 border-blue-100' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        {tx.type === 'purchase' ? <ArrowDownLeft className="mr-1.5 h-3 w-3" /> : <ArrowUpRight className="mr-1.5 h-3 w-3" />}
                        {tx.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{tx.productName}</div>
                      <div className="text-gray-400 text-xs mt-0.5">{tx.partyName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right font-medium">
                      {tx.quantity.toLocaleString()} <span className="text-gray-400 font-normal">{tx.unit}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-gray-900">
                      {'\u20B9'}{tx.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                       {tx.paymentStatus === 'paid' ? (
                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                           Paid
                         </span>
                       ) : (
                         <div className="flex flex-col items-center">
                           <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mb-1 ${
                             tx.paymentStatus === 'overdue' 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-yellow-100 text-yellow-800'
                           }`}>
                             {tx.paymentStatus === 'overdue' && <AlertTriangle className="w-3 h-3 mr-1" />}
                             {tx.paymentStatus === 'overdue' ? 'Overdue' : 'Pending'}
                           </span>
                           {tx.dueDate && (
                             <span className={`text-[10px] ${tx.paymentStatus === 'overdue' ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                               {tx.paymentStatus === 'overdue' 
                                 ? `${Math.abs(getDaysRemaining(tx.dueDate))} days late` 
                                 : `${getDaysRemaining(tx.dueDate)} days left`
                               }
                             </span>
                           )}
                         </div>
                       )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                         {tx.paymentStatus !== 'paid' && (
                           <button
                            onClick={() => handleMarkAsPaid(tx.id)}
                            className="text-emerald-500 hover:text-emerald-700 p-1 bg-emerald-50 rounded-md"
                            title="Mark as Paid"
                           >
                             <Check size={16} />
                           </button>
                         )}
                        <button 
                          onClick={() => generatePDF(tx)}
                          disabled={!!pdfGenerating}
                          className="text-gray-400 hover:text-gray-900 transition-colors p-1"
                          title="Download Invoice"
                        >
                          {pdfGenerating === tx.id ? (
                            <span className="animate-spin">↻</span>
                          ) : (
                            <FileText size={16} />
                          )}
                        </button>
                        {userRole === 'admin' && (
                          <button 
                            onClick={() => handleDelete(tx.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors p-1"
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'sale' && renderForm('sale')}
      {activeTab === 'purchase' && renderForm('purchase')}

      <Modal 
        isOpen={isProductModalOpen} 
        onClose={() => setIsProductModalOpen(false)}
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
            <Button type="button" variant="secondary" onClick={() => setIsProductModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={isProductSubmitting}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};