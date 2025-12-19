import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, FileText, Trash2, Download, Plus, Check, Clock, AlertTriangle, Scale, Coins } from 'lucide-react';
import { Card, Button } from './ui/LayoutComponents';
import { Modal } from './ui/Modal';
import { Product, Transaction, UserRole, InventoryItem } from '../types';
import { dbService } from '../services/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { safeString } from '../lib/utils';

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
  
  const [formData, setFormData] = useState({
    productId: '',
    partyName: '',
    quantity: '',
    deduction: '0',
    deductionReason: '',
    extraAmount: '',
    extraReason: '',
    pricePerUnit: '',
    date: new Date().toISOString().split('T')[0],
    paymentType: 'cash' as 'cash' | 'credit',
    creditPeriod: '30'
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', category: '', minStockLevel: 10, unit: 'kg' });
  const [isProductSubmitting, setIsProductSubmitting] = useState(false);

  const suppliers = Array.from(new Set(transactions.filter(t => t.type === 'purchase').map(t => safeString(t.partyName))));
  const receivers = Array.from(new Set(transactions.filter(t => t.type === 'sale').map(t => safeString(t.partyName))));

  const selectedProduct = products.find(p => p.id === formData.productId);
  const currentUnit = selectedProduct ? safeString(selectedProduct.unit) : 'units';

  const grossQty = parseFloat(formData.quantity) || 0;
  const deductionAmt = parseFloat(formData.deduction) || 0;
  const netQty = Math.max(0, grossQty - deductionAmt);
  const extraAmt = parseFloat(formData.extraAmount) || 0;

  const handleTransaction = async (e: React.FormEvent, type: 'purchase' | 'sale') => {
    e.preventDefault();
    if (type === 'sale') {
      const item = inventory.find(i => i.id === formData.productId);
      if (!item || item.stock < netQty) {
        alert(`Insufficient stock! Current stock: ${item?.stock} ${item?.unit}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await dbService.addTransaction({
        productId: formData.productId,
        type,
        partyName: safeString(formData.partyName).trim(),
        quantity: grossQty,
        deduction: type === 'purchase' ? deductionAmt : 0,
        deductionReason: type === 'purchase' && deductionAmt > 0 ? safeString(formData.deductionReason || 'Packaging').trim() : undefined,
        
        extraAmount: extraAmt,
        extraReason: extraAmt > 0 ? safeString(formData.extraReason || 'Misc Fees').trim() : undefined,

        pricePerUnit: parseFloat(formData.pricePerUnit),
        date: formData.date,
        paymentType: formData.paymentType,
        creditPeriod: formData.paymentType === 'credit' ? parseInt(formData.creditPeriod) : undefined
      }, products, userId);
      
      setFormData({ 
        productId: '', 
        partyName: '', 
        quantity: '', 
        deduction: '0',
        deductionReason: '',
        extraAmount: '',
        extraReason: '',
        pricePerUnit: '',
        date: new Date().toISOString().split('T')[0],
        paymentType: 'cash',
        creditPeriod: '30'
      });
      setActiveTab('history');
      onRefresh();
    } catch (error) {
      console.error(error);
      alert("Failed to process transaction: " + safeString(error));
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
        alert("Failed to update status: " + safeString(err));
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
      alert("Failed to add product: " + safeString(err));
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
        alert("Cannot delete this transaction: " + safeString(err));
      }
    }
  };

  const handleExportExcel = () => {
    const data = transactions.map(t => ({
      Date: new Date(t.date).toLocaleDateString(),
      Type: safeString(t.type).toUpperCase(),
      ID: safeString(t.id),
      Product: safeString(t.productName),
      Party: safeString(t.partyName),
      'Gross Qty': Number(t.quantity),
      'Deduction': Number(t.deduction || 0),
      'Deduction Reason': safeString(t.deductionReason || ''),
      'Net Qty': Number(t.quantity) - Number(t.deduction || 0),
      Unit: safeString(t.unit),
      'Price/Unit': Number(t.pricePerUnit),
      'Extra Charges': Number(t.extraAmount || 0),
      'Extra Reason': safeString(t.extraReason || ''),
      'Total Value': Number(t.totalValue),
      'Payment': safeString(t.paymentType).toUpperCase(),
      'Status': safeString(t.paymentStatus).toUpperCase()
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
      
      // Colors
      const brandColor = [14, 165, 233] as [number, number, number]; // Sky 500
      const darkColor = [15, 23, 42] as [number, number, number]; // Slate 900
      const grayColor = [100, 116, 139] as [number, number, number]; // Slate 500
      const lightGray = [248, 250, 252] as [number, number, number]; // Slate 50

      // -- Header Background --
      doc.setFillColor(...lightGray);
      doc.rect(0, 0, 210, 40, 'F');

      // -- Brand Name --
      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.setTextColor(...darkColor);
      doc.text("FINTRACK", 20, 25);
      
      doc.setFontSize(10);
      doc.setTextColor(...grayColor);
      doc.setFont("helvetica", "normal");
      doc.text("Enterprise Resource Planning", 20, 32);

      // -- Doc Type --
      doc.setFontSize(30);
      doc.setTextColor(226, 232, 240); // Subtle background text color
      doc.setFont("helvetica", "bold");
      const docLabel = tx.type === 'sale' ? "INVOICE" : "PURCHASE";
      doc.text(docLabel, 190, 28, { align: 'right' });

      // -- Status Stamp --
      if (tx.paymentStatus === 'paid') {
          doc.setDrawColor(16, 185, 129); // Emerald 500
          doc.setTextColor(16, 185, 129);
          doc.setLineWidth(0.5);
          doc.roundedRect(160, 35, 30, 8, 2, 2, 'D');
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("PAID", 175, 40, { align: 'center' });
      } else if (tx.paymentStatus === 'overdue') {
          doc.setDrawColor(239, 68, 68); // Red 500
          doc.setTextColor(239, 68, 68);
          doc.setLineWidth(0.5);
          doc.roundedRect(160, 35, 30, 8, 2, 2, 'D');
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("OVERDUE", 175, 40, { align: 'center' });
      }

      // -- Info Grid --
      const startY = 60;
      
      // Left Side: Party Details
      doc.setFontSize(9);
      doc.setTextColor(...grayColor);
      doc.setFont("helvetica", "bold");
      doc.text(tx.type === 'sale' ? "BILL TO" : "SUPPLIER", 20, startY);
      
      doc.setFontSize(14);
      doc.setTextColor(...darkColor);
      doc.setFont("helvetica", "bold");
      doc.text(safeString(tx.partyName), 20, startY + 8);
      
      // Right Side: Meta Details
      const rightColLabelX = 140;
      const rightColValueX = 190;
      
      doc.setFontSize(9);
      doc.setTextColor(...grayColor);
      doc.setFont("helvetica", "normal");
      
      doc.text("Invoice #", rightColLabelX, startY);
      doc.text("Date", rightColLabelX, startY + 6);
      if (tx.dueDate) doc.text("Due Date", rightColLabelX, startY + 12);
      
      doc.setTextColor(...darkColor);
      doc.setFont("helvetica", "bold");
      doc.text(`#${safeString(tx.id).substring(0, 8).toUpperCase()}`, rightColValueX, startY, { align: 'right' });
      doc.text(new Date(tx.date).toLocaleDateString(), rightColValueX, startY + 6, { align: 'right' });
      if (tx.dueDate) doc.text(new Date(tx.dueDate).toLocaleDateString(), rightColValueX, startY + 12, { align: 'right' });

      // -- Table Section --
      const netQuantity = (Number(tx.quantity) || 0) - (Number(tx.deduction) || 0);
      const subTotal = netQuantity * Number(tx.pricePerUnit);
      
      let desc = safeString(tx.productName);
      // Detailed description
      if (tx.deduction && tx.deduction > 0) {
        const reason = tx.deductionReason ? `(${safeString(tx.deductionReason)})` : '';
        desc += `\n • Gross: ${Number(tx.quantity)} ${safeString(tx.unit)}`;
        desc += `\n • Deduction: -${Number(tx.deduction)} ${safeString(tx.unit)} ${reason}`;
      }

      const tableBody = [
        [
          desc,
          `${netQuantity} ${safeString(tx.unit)}`,
          `${Number(tx.pricePerUnit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          `${subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ]
      ];

      if (tx.extraAmount && tx.extraAmount > 0) {
        tableBody.push([
          `Add. Charge: ${tx.extraReason || 'Miscellaneous'}`,
          '1',
          `${Number(tx.extraAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          `${Number(tx.extraAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ]);
      }

      // @ts-ignore
      autoTable(doc, {
        startY: startY + 25,
        head: [['DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
        body: tableBody,
        theme: 'grid', // 'grid' theme gives borders, we can customize
        headStyles: {
          fillColor: [...darkColor],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9,
          halign: 'left',
          cellPadding: 4,
          lineWidth: 0
        },
        columnStyles: {
          0: { cellWidth: 90 }, // Description
          1: { cellWidth: 30, halign: 'right' }, // Qty
          2: { cellWidth: 35, halign: 'right' }, // Price
          3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' } // Total
        },
        bodyStyles: {
          textColor: [...darkColor],
          fontSize: 10,
          cellPadding: 6,
          valign: 'top',
          lineColor: 230,
          lineWidth: 0.1
        },
        styles: {
            cellPadding: 5,
            fontSize: 10,
        },
      });

      // -- Totals --
      // @ts-ignore
      const finalY = doc.lastAutoTable.finalY + 15;
      
      // Total Box
      doc.setFillColor(...lightGray);
      doc.roundedRect(130, finalY - 5, 70, 20, 2, 2, 'F');
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...grayColor);
      doc.text("Total Amount", 135, finalY + 7);

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...darkColor);
      doc.text(`INR ${Number(tx.totalValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 195, finalY + 7, { align: 'right' });

      // -- Footer --
      const pageHeight = doc.internal.pageSize.height;
      doc.setDrawColor(226, 232, 240);
      doc.line(20, pageHeight - 20, 190, pageHeight - 20);
      
      doc.setFontSize(8);
      doc.setTextColor(...grayColor);
      doc.text("Thank you for your business.", 20, pageHeight - 12);
      doc.text("Generated by Fintrack ERP", 190, pageHeight - 12, { align: 'right' });

      doc.save(`${safeString(tx.type)}_invoice_${safeString(tx.id)}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF: " + safeString(err));
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
                    <option key={p.id} value={p.id}>{safeString(p.name)} ({safeString(p.unit)})</option>
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
            
            <div className={type === 'purchase' ? 'sm:col-span-2 space-y-4' : ''}>
              <div className={type === 'purchase' ? 'grid grid-cols-2 gap-3' : ''}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{type === 'purchase' ? 'Gross Qty' : 'Quantity'}</label>
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
                      <span className="text-gray-400 text-sm">{safeString(currentUnit)}</span>
                    </div>
                  </div>
                </div>
                {type === 'purchase' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deduction Amount</label>
                    <div className="relative">
                      <input 
                        type="number"
                        min="0"
                        step="0.01"
                        className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5 pr-12"
                        value={formData.deduction}
                        onChange={e => setFormData({...formData, deduction: e.target.value})}
                        placeholder="0.00"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <span className="text-gray-400 text-sm">{safeString(currentUnit)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {type === 'purchase' && parseFloat(formData.deduction) > 0 && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Deduction</label>
                  <input 
                    type="text"
                    className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                    value={formData.deductionReason}
                    onChange={e => setFormData({...formData, deductionReason: e.target.value})}
                    placeholder="e.g. Packaging, Moisture Loss"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {type === 'purchase' ? 'Cost Price' : 'Selling Price'} <span className="text-xs text-gray-400 font-normal">(per {safeString(currentUnit)})</span>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Extra / Misc Charges <span className="text-xs text-gray-400 font-normal">(Shipping, Tax)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm">₹</span>
                  </div>
                  <input 
                    type="number"
                    min="0"
                    step="0.01"
                    className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5 pl-7"
                    value={formData.extraAmount}
                    onChange={e => setFormData({...formData, extraAmount: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {parseFloat(formData.extraAmount) > 0 && (
               <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Extra Charges</label>
                <input 
                  type="text"
                  className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                  value={formData.extraReason}
                  onChange={e => setFormData({...formData, extraReason: e.target.value})}
                  placeholder="e.g. Shipping Fee, Loading Charges"
                />
              </div>
            )}
          </div>

          {type === 'purchase' && grossQty > 0 && (
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex justify-between items-center transition-all">
               <span className="text-sm font-medium text-brand-700">Net Stock Addition:</span>
               <span className="text-lg font-bold text-brand-900">{netQty.toLocaleString()} {safeString(currentUnit)}</span>
            </div>
          )}

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
        <div className="flex space-x-1 rounded-xl bg-gray-200/60 p-1 w-fit">
          {['history', 'sale', 'purchase'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-2 rounded-lg text-sm font-medium leading-5 transition-all ${activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}
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
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty (Net)</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {transactions.map((tx) => {
                  const net = (Number(tx.quantity) || 0) - (Number(tx.deduction) || 0);
                  const hasExtras = tx.extraAmount && tx.extraAmount > 0;
                  return (
                    <tr key={tx.id} className="group hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${tx.type === 'purchase' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                          {tx.type === 'purchase' ? <ArrowDownLeft className="mr-1.5 h-3 w-3" /> : <ArrowUpRight className="mr-1.5 h-3 w-3" />}
                          {safeString(tx.type).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{safeString(tx.productName)}</div>
                        <div className="text-gray-400 text-xs mt-0.5">{safeString(tx.partyName)}</div>
                        <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1">
                          {tx.deduction && tx.deduction > 0 ? (
                            <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded-md">
                              <Scale size={10} /> 
                              <span>Ded: -{Number(tx.deduction)}</span>
                              {tx.deductionReason && <span className="font-bold">({safeString(tx.deductionReason)})</span>}
                            </div>
                          ) : null}
                          {hasExtras ? (
                             <div className="text-[10px] text-purple-600 font-medium flex items-center gap-1 bg-purple-50 px-1.5 py-0.5 rounded-md">
                              <Coins size={10} />
                              <span>Extra: +{Number(tx.extraAmount)}</span>
                              {tx.extraReason && <span className="font-bold">({safeString(tx.extraReason)})</span>}
                             </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right font-medium">
                        {net.toLocaleString()} <span className="text-gray-400 font-normal">{safeString(tx.unit)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-right text-gray-900">
                        {'\u20B9'}{Number(tx.totalValue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                         {tx.paymentStatus === 'paid' ? (
                           <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Paid</span>
                         ) : (
                           <div className="flex flex-col items-center">
                             <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mb-1 ${tx.paymentStatus === 'overdue' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                               {tx.paymentStatus === 'overdue' && <AlertTriangle className="w-3 h-3 mr-1" />}
                               {tx.paymentStatus === 'overdue' ? 'Overdue' : 'Pending'}
                             </span>
                             {tx.dueDate && (
                               <span className={`text-[10px] ${tx.paymentStatus === 'overdue' ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                                 {tx.paymentStatus === 'overdue' ? `${Math.abs(getDaysRemaining(tx.dueDate))} days late` : `${getDaysRemaining(tx.dueDate)} days left`}
                               </span>
                             )}
                           </div>
                         )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                           {tx.paymentStatus !== 'paid' && (
                             <button onClick={() => handleMarkAsPaid(tx.id)} className="text-emerald-500 hover:text-emerald-700 p-1 bg-emerald-50 rounded-md" title="Mark as Paid">
                               <Check size={16} />
                             </button>
                           )}
                          <button onClick={() => generatePDF(tx)} disabled={!!pdfGenerating} className="text-gray-400 hover:text-gray-900 transition-colors p-1" title="Download Invoice">
                            {pdfGenerating === tx.id ? <span className="animate-spin text-gray-400">↻</span> : <FileText size={16} />}
                          </button>
                          {userRole === 'admin' && (
                            <button onClick={() => handleDelete(tx.id)} className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Delete Record">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'sale' && renderForm('sale')}
      {activeTab === 'purchase' && renderForm('purchase')}

      <Modal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} title="New Product">
        <form onSubmit={handleAddProduct} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
            <input required type="text" className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input required type="text" className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5" value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Type</label>
              <select className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5" value={newProduct.unit} onChange={e => setNewProduct({...newProduct, unit: e.target.value})}>
                {UNIT_TYPES.map(u => <option key={u} value={u}>{safeString(u).toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Alert</label>
              <input required type="number" min="0" className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5" value={newProduct.minStockLevel} onChange={e => setNewProduct({...newProduct, minStockLevel: parseInt(e.target.value)})}/>
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