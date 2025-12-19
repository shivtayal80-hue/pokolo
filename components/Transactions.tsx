import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, FileText, Trash2, Download, Plus, Check, Clock, AlertTriangle, Scale, Coins, CheckSquare } from 'lucide-react';
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
  
  // Selection State
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);

  // State for multi-item form
  const [items, setItems] = useState([
    { productId: '', quantity: '', deduction: '0', deductionReason: '', pricePerUnit: '' }
  ]);

  const [generalData, setGeneralData] = useState({
    partyName: '',
    date: new Date().toISOString().split('T')[0],
    paymentType: 'cash' as 'cash' | 'credit',
    creditPeriod: '30',
    extraAmount: '',
    extraReason: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState<string | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', category: '', minStockLevel: 10, unit: 'kg' });
  const [isProductSubmitting, setIsProductSubmitting] = useState(false);

  const suppliers = Array.from(new Set(transactions.filter(t => t.type === 'purchase').map(t => safeString(t.partyName))));
  const receivers = Array.from(new Set(transactions.filter(t => t.type === 'sale').map(t => safeString(t.partyName))));

  const toggleSelection = (id: string) => {
    setSelectedTxIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedTxIds(transactions.map(t => t.id));
    } else {
      setSelectedTxIds([]);
    }
  };

  const addItem = () => {
    setItems([...items, { productId: '', quantity: '', deduction: '0', deductionReason: '', pricePerUnit: '' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: string, value: string) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const handleTransaction = async (e: React.FormEvent, type: 'purchase' | 'sale') => {
    e.preventDefault();
    
    // Validation
    for (const item of items) {
      if (!item.productId || !item.quantity || !item.pricePerUnit) {
        alert("Please fill in all product details for all items.");
        return;
      }
      
      const grossQty = parseFloat(item.quantity) || 0;
      const deductionAmt = parseFloat(item.deduction) || 0;
      const netQty = Math.max(0, grossQty - deductionAmt);

      if (type === 'sale') {
        const invItem = inventory.find(i => i.id === item.productId);
        if (!invItem || invItem.stock < netQty) {
          alert(`Insufficient stock for product. Current: ${invItem?.stock}`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      await dbService.addTransaction({
        items: items.map(i => ({
          productId: i.productId,
          quantity: parseFloat(i.quantity),
          deduction: parseFloat(i.deduction),
          deductionReason: i.deductionReason,
          pricePerUnit: parseFloat(i.pricePerUnit)
        })),
        type,
        partyName: safeString(generalData.partyName).trim(),
        date: generalData.date,
        paymentType: generalData.paymentType,
        creditPeriod: generalData.paymentType === 'credit' ? parseInt(generalData.creditPeriod) : undefined,
        extraAmount: parseFloat(generalData.extraAmount),
        extraReason: generalData.extraReason
      }, products, userId);
      
      // Reset Form
      setItems([{ productId: '', quantity: '', deduction: '0', deductionReason: '', pricePerUnit: '' }]);
      setGeneralData({
        partyName: '',
        date: new Date().toISOString().split('T')[0],
        paymentType: 'cash',
        creditPeriod: '30',
        extraAmount: '',
        extraReason: ''
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
      await dbService.addProduct(newProduct, userId);
      setNewProduct({ name: '', category: '', minStockLevel: 10, unit: 'kg' });
      setIsProductModalOpen(false);
      await onRefresh();
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
      
      const darkColor = [15, 23, 42] as [number, number, number]; 
      const grayColor = [100, 116, 139] as [number, number, number]; 
      const lightGray = [248, 250, 252] as [number, number, number];
      
      // Transaction Type Colors
      const saleColor = [22, 163, 74] as [number, number, number]; // Green
      const purchaseColor = [220, 38, 38] as [number, number, number]; // Red

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

      // -- Doc Type with Color Coding --
      doc.setFontSize(24);
      if (tx.type === 'sale') {
        doc.setTextColor(...saleColor);
        doc.text("SALE INVOICE", 190, 28, { align: 'right' });
      } else {
        doc.setTextColor(...purchaseColor);
        doc.text("PURCHASE ORDER", 190, 28, { align: 'right' });
      }

      // -- Status Stamp --
      if (tx.paymentStatus === 'paid') {
          doc.setDrawColor(16, 185, 129);
          doc.setTextColor(16, 185, 129);
          doc.setLineWidth(0.5);
          doc.roundedRect(160, 35, 30, 8, 2, 2, 'D');
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("PAID", 175, 40, { align: 'center' });
      } else if (tx.paymentStatus === 'overdue') {
          doc.setDrawColor(239, 68, 68);
          doc.setTextColor(239, 68, 68);
          doc.setLineWidth(0.5);
          doc.roundedRect(160, 35, 30, 8, 2, 2, 'D');
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("OVERDUE", 175, 40, { align: 'center' });
      }

      // -- Info Grid --
      const startY = 60;
      
      doc.setFontSize(9);
      doc.setTextColor(...grayColor);
      doc.setFont("helvetica", "bold");
      doc.text(tx.type === 'sale' ? "BILL TO" : "SUPPLIER", 20, startY);
      
      doc.setFontSize(14);
      doc.setTextColor(...darkColor);
      doc.setFont("helvetica", "bold");
      doc.text(safeString(tx.partyName), 20, startY + 8);
      
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
        theme: 'grid', 
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

  const generateConsolidatedPDF = (selectedIds: string[]) => {
    const itemsToInvoice = transactions.filter(t => selectedIds.includes(t.id));
    if (itemsToInvoice.length === 0) return;

    const hasSales = itemsToInvoice.some(t => t.type === 'sale');
    const hasPurchases = itemsToInvoice.some(t => t.type === 'purchase');
    const isMixed = hasSales && hasPurchases;

    try {
      const doc = new jsPDF();
      
      // Header Style (Dark Theme)
      doc.setFillColor(17, 24, 39); 
      doc.rect(0, 0, 210, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("FINTRACK CONSOLIDATED INVOICE", 15, 26);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, 34);

      if (isMixed) {
        doc.text("(Net Settlement: Sales - Purchases)", 15, 45);
      }

      // Prepare rows for all selected items
      const tableRows = itemsToInvoice.map(tx => {
        const netQuantity = (Number(tx.quantity) || 0) - (Number(tx.deduction) || 0);
        
        // Particulars Detail
        let particulars = safeString(tx.productName);
        
        // Add Deduction Details
        if (tx.deduction && tx.deduction > 0) {
          const reason = tx.deductionReason ? ` (${safeString(tx.deductionReason)})` : '';
          particulars += `\n • Gross: ${Number(tx.quantity)} | Ded: -${Number(tx.deduction)}${reason}`;
        }

        // Add Extra Charge Details
        if (tx.extraAmount && tx.extraAmount > 0) {
           const reason = tx.extraReason ? ` (${safeString(tx.extraReason)})` : '';
           particulars += `\n • Extra Charges: +${Number(tx.extraAmount).toLocaleString()}${reason}`;
        }

        let displayTotal = Number(tx.totalValue);
        if (isMixed && tx.type === 'purchase') {
            displayTotal = -displayTotal;
        }

        return [
          new Date(tx.date).toLocaleDateString(),
          tx.type.toUpperCase(), // New Type Column
          particulars,
          `${netQuantity} ${safeString(tx.unit)}`,
          `${Number(tx.pricePerUnit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          `${displayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
        ];
      });

      let totalAmount = 0;
      if (isMixed) {
        totalAmount = itemsToInvoice.reduce((sum, tx) => {
            const val = Number(tx.totalValue) || 0;
            return sum + (tx.type === 'sale' ? val : -val);
        }, 0);
      } else {
        totalAmount = itemsToInvoice.reduce((sum, tx) => sum + Number(tx.totalValue), 0);
      }

      // @ts-ignore
      autoTable(doc, {
        startY: isMixed ? 55 : 50,
        head: [["Date", "Type", "Particulars", "Net Qty", "Price/Unit", "Total (INR)"]],
        body: tableRows,
        theme: 'grid',
        styles: {
          fontSize: 9,
          cellPadding: 4,
          overflow: 'linebreak',
          valign: 'middle'
        },
        headStyles: {
          fillColor: [17, 24, 39], // Dark header
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 25, fontStyle: 'bold' }, // Type Column Width
          2: { cellWidth: 'auto' }, 
          3: { cellWidth: 25, halign: 'right' },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' }
        },
        // Color coding for Type column
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 1) {
                const type = data.cell.raw as string;
                if (type === 'SALE') {
                    data.cell.styles.textColor = [22, 163, 74]; // Green
                } else if (type === 'PURCHASE') {
                    data.cell.styles.textColor = [220, 38, 38]; // Red
                }
            }
        },
        foot: [['', '', '', '', 'Grand Total', `${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`]],
        footStyles: { 
          fillColor: [249, 250, 251], 
          fontStyle: 'bold', 
          textColor: [17, 24, 39],
          halign: 'right'
        }
      });

      doc.save(`Consolidated_Invoice_${Date.now()}.pdf`);
      setSelectedTxIds([]); // Clear selection after generating
    } catch (err) {
      console.error(err);
      alert("Failed to generate PDF: " + safeString(err));
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
      <Card title={`Record New ${type === 'purchase' ? 'Purchase (Inbound)' : 'Sale (Outbound)'}`} className="max-w-4xl mx-auto border-none shadow-card">
        <form onSubmit={(e) => handleTransaction(e, type)} className="space-y-6">
          {/* General Details Section */}
          <div className="bg-gray-50/50 rounded-xl p-5 border border-gray-100 space-y-5">
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">General Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {type === 'purchase' ? 'Supplier Name' : 'Receiver / Client'}
                </label>
                <input 
                  required
                  type="text"
                  list={listId}
                  className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                  value={generalData.partyName}
                  onChange={e => setGeneralData({...generalData, partyName: e.target.value})}
                  placeholder={type === 'purchase' ? "e.g. Acme Corp" : "e.g. John Doe"}
                />
                <datalist id={listId}>
                  {suggestions.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Date</label>
                <input 
                  required
                  type="date"
                  className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                  value={generalData.date}
                  onChange={e => setGeneralData({...generalData, date: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
                <div className="flex bg-white rounded-xl border border-gray-200 p-1">
                  <button
                    type="button"
                    onClick={() => setGeneralData({...generalData, paymentType: 'cash'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${generalData.paymentType === 'cash' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setGeneralData({...generalData, paymentType: 'credit'})}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${generalData.paymentType === 'credit' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Credit
                  </button>
                </div>
              </div>

              {generalData.paymentType === 'credit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credit Period (Days)</label>
                  <div className="relative">
                     <Clock className="absolute top-2.5 left-3 h-4 w-4 text-gray-400" />
                     <input 
                      required
                      type="number"
                      min="1"
                      className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5 pl-9"
                      value={generalData.creditPeriod}
                      onChange={e => setGeneralData({...generalData, creditPeriod: e.target.value})}
                      placeholder="30"
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Extra Charges Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-gray-200/50">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Extra Charges/Discount (INR)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-400 text-sm">₹</span>
                  </div>
                  <input 
                    type="number"
                    className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5 pl-7"
                    value={generalData.extraAmount}
                    onChange={e => setGeneralData({...generalData, extraAmount: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Adjustment
                </label>
                <input 
                  type="text"
                  className="block w-full rounded-xl border-gray-200 shadow-sm focus:border-gray-300 focus:ring-0 text-sm py-2.5"
                  value={generalData.extraReason}
                  onChange={e => setGeneralData({...generalData, extraReason: e.target.value})}
                  placeholder="e.g. Shipping, Discount"
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Products List</h4>
              <div className="flex gap-2">
                {type === 'purchase' && (
                    <Button type="button" onClick={() => setIsProductModalOpen(true)} variant="secondary" className="text-xs py-1.5">
                      <Plus className="w-3 h-3 mr-1" /> New Product
                    </Button>
                )}
                <Button type="button" onClick={addItem} variant="secondary" className="text-xs py-1.5">
                  <Plus className="w-3 h-3 mr-1" /> Add Row
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="p-5 bg-white rounded-xl border border-gray-200 shadow-sm relative group">
                  {items.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => removeItem(index)}
                      className="absolute -top-3 -right-3 bg-white text-red-500 shadow-md border rounded-full p-1.5 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                      title="Remove Item"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* Product Selector */}
                    <div className="md:col-span-4">
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Product</label>
                      <select 
                        required 
                        className="w-full rounded-lg border-gray-200 text-sm focus:border-gray-300 focus:ring-0"
                        value={item.productId}
                        onChange={e => updateItem(index, 'productId', e.target.value)}
                      >
                        <option value="">Select...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                        ))}
                      </select>
                      {type === 'sale' && item.productId && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Stock: {inventory.find(i => i.id === item.productId)?.stock || 0}
                        </p>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Quantity</label>
                      <input 
                        type="number" required min="0.01" step="0.01"
                        className="w-full rounded-lg border-gray-200 text-sm focus:border-gray-300 focus:ring-0"
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', e.target.value)}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Deduction (Purchase Only) */}
                    {type === 'purchase' ? (
                       <div className="md:col-span-3 grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Deduction</label>
                            <input 
                              type="number" min="0" step="0.01"
                              className="w-full rounded-lg border-gray-200 text-sm focus:border-gray-300 focus:ring-0"
                              value={item.deduction}
                              onChange={e => updateItem(index, 'deduction', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 mb-1 block">Reason</label>
                            <input 
                              type="text"
                              className="w-full rounded-lg border-gray-200 text-sm focus:border-gray-300 focus:ring-0"
                              value={item.deductionReason}
                              onChange={e => updateItem(index, 'deductionReason', e.target.value)}
                              placeholder="Reason"
                              disabled={!item.deduction || parseFloat(item.deduction) <= 0}
                            />
                          </div>
                       </div>
                    ) : (
                      <div className="md:col-span-3"></div> // Spacer for sales
                    )}

                    {/* Price */}
                    <div className="md:col-span-3">
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Price/Unit</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-gray-400 text-xs">₹</span>
                        <input 
                          type="number" required min="0.01" step="0.01"
                          className="w-full rounded-lg border-gray-200 text-sm pl-6 focus:border-gray-300 focus:ring-0"
                          value={item.pricePerUnit}
                          onChange={e => updateItem(index, 'pricePerUnit', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Row Total */}
                   <div className="mt-3 pt-3 border-t border-gray-50 flex justify-end">
                     <span className="text-xs font-bold text-gray-700 bg-gray-50 px-2 py-1 rounded">
                       Row Total: ₹{(((parseFloat(item.quantity) || 0) - (parseFloat(item.deduction) || 0)) * (parseFloat(item.pricePerUnit) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                     </span>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Grand Total Preview */}
            <div className="flex justify-end mt-6">
                <div className="bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-400">Grand Total</span>
                  <span className="text-xl font-bold">
                    ₹{
                      (items.reduce((acc, item) => {
                         const net = (parseFloat(item.quantity) || 0) - (parseFloat(item.deduction) || 0);
                         return acc + (net * (parseFloat(item.pricePerUnit) || 0));
                      }, 0) + (parseFloat(generalData.extraAmount) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })
                    }
                  </span>
                </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
          {/* Action Toolbar for Selections */}
          {selectedTxIds.length > 0 && (
            <div className="px-6 py-3 bg-brand-50 border-b border-brand-100 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
              <span className="text-sm font-medium text-brand-900 flex items-center gap-2">
                <CheckSquare size={18} className="text-brand-600" />
                {selectedTxIds.length} item{selectedTxIds.length > 1 ? 's' : ''} selected
              </span>
              <Button 
                onClick={() => generateConsolidatedPDF(selectedTxIds)} 
                variant="primary" 
                className="bg-blue-600 hover:bg-blue-700 border-none py-1.5 text-xs shadow-sm mb-0"
              >
                <FileText className="h-3.5 w-3.5 mr-2" />
                Generate Invoice for {selectedTxIds.length} Items
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-6 py-4 w-10">
                    <input 
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      onChange={handleSelectAll}
                      checked={transactions.length > 0 && selectedTxIds.length === transactions.length}
                    />
                  </th>
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
                  const isSelected = selectedTxIds.includes(tx.id);
                  
                  return (
                    <tr key={tx.id} className={`group hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(tx.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                      </td>
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