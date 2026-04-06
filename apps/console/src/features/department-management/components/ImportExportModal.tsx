import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Download, Upload, FileText, AlertTriangle, 
  CheckCircle, X, File, ExternalLink 
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Card, CardContent, CardHeader, CardTitle,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Alert, AlertDescription
} from '@dm3/ui';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<boolean>;
}

interface ImportResult {
  success: number;
  errors: string[];
  warnings: string[];
}

export function ImportExportModal({ isOpen, onClose, onExport, onImport }: ImportExportModalProps) {
  const { t } = useTranslation('departments');
  
  // State
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Reset state when modal opens/closes
  const handleClose = () => {
    setSelectedFile(null);
    setImportResult(null);
    setDragOver(false);
    onClose();
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setImportResult(null);
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => 
      file.type === 'text/csv' || 
      file.name.toLowerCase().endsWith('.csv')
    );
    
    if (csvFile) {
      handleFileSelect(csvFile);
    }
  };

  // Handle export
  const handleExport = async () => {
    setLoading(true);
    try {
      await onExport();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle import
  const handleImport = async () => {
    if (!selectedFile) return;

    setLoading(true);
    try {
      const success = await onImport(selectedFile);
      if (success) {
        setImportResult({
          success: 1, // This would come from the API response
          errors: [],
          warnings: []
        });
        setSelectedFile(null);
      }
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate sample CSV content
  const generateSampleCsv = () => {
    const sampleData = [
      ['name', 'number', 'description', 'manager_email', 'parent_number', 'status'],
      ['Engineering', 'ENG001', 'Software Engineering Department', 'manager@company.com', '', 'active'],
      ['Frontend Team', 'ENG001-FE', 'Frontend Development Team', 'fe-lead@company.com', 'ENG001', 'active'],
      ['Backend Team', 'ENG001-BE', 'Backend Development Team', 'be-lead@company.com', 'ENG001', 'active'],
      ['Marketing', 'MKT001', 'Marketing and Communications', 'marketing@company.com', '', 'active'],
      ['Sales', 'SAL001', 'Sales Department', 'sales@company.com', '', 'active']
    ];

    const csvContent = sampleData.map(row => 
      row.map(field => `"${field}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'departments-sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={20} />
            Import/Export Departments
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'export' | 'import')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download size={16} />
              Export
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload size={16} />
              Import
            </TabsTrigger>
          </TabsList>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download size={18} />
                  Export Departments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Export all departments to a CSV file. This will include department information, 
                    hierarchy, and manager assignments.
                  </p>
                  
                  <Alert>
                    <AlertTriangle size={16} />
                    <AlertDescription>
                      The export will include all departments visible to your current role and company access.
                    </AlertDescription>
                  </Alert>
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-medium mb-2">Export includes:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Department name and number</li>
                    <li>• Description and status</li>
                    <li>• Manager assignments</li>
                    <li>• Parent-child relationships</li>
                    <li>• User count and created date</li>
                  </ul>
                </div>

                <Button 
                  onClick={handleExport} 
                  disabled={loading}
                  className="w-full"
                >
                  <Download size={16} className="mr-2" />
                  {loading ? 'Exporting...' : 'Export Departments'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload size={18} />
                  Import Departments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Import departments from a CSV file. The file should contain the required columns 
                    in the correct format.
                  </p>

                  <div className="flex items-center gap-2 mb-4">
                    <Button variant="outline" size="sm" onClick={generateSampleCsv}>
                      <Download size={14} className="mr-2" />
                      Download Sample
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Download a sample CSV file to see the required format
                    </span>
                  </div>
                </div>

                {/* File Drop Zone */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragOver 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                >
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <File size={24} className="text-green-600" />
                      <div className="text-left">
                        <div className="font-medium">{selectedFile.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedFile(null)}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={32} className="mx-auto text-muted-foreground mb-4" />
                      <div className="mb-2">
                        <span className="font-medium">Drop your CSV file here</span>
                      </div>
                      <div className="text-sm text-muted-foreground mb-4">
                        or click to browse files
                      </div>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                        className="hidden"
                        id="file-input"
                      />
                      <Button variant="outline" asChild>
                        <label htmlFor="file-input" className="cursor-pointer">
                          Choose File
                        </label>
                      </Button>
                    </div>
                  )}
                </div>

                {/* Required Format Info */}
                <div className="bg-muted rounded-lg p-4">
                  <h4 className="font-medium mb-2">Required CSV Columns:</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div><code className="bg-background px-1 rounded">name</code> - Department name (required)</div>
                    <div><code className="bg-background px-1 rounded">number</code> - Unique department number (required)</div>
                    <div><code className="bg-background px-1 rounded">description</code> - Department description (optional)</div>
                    <div><code className="bg-background px-1 rounded">manager_email</code> - Manager email address (optional)</div>
                    <div><code className="bg-background px-1 rounded">parent_number</code> - Parent department number (optional)</div>
                    <div><code className="bg-background px-1 rounded">status</code> - active or inactive (optional, defaults to active)</div>
                  </div>
                </div>

                {/* Import Result */}
                {importResult && (
                  <Alert>
                    <CheckCircle size={16} />
                    <AlertDescription>
                      Successfully imported {importResult.success} departments.
                      {importResult.errors.length > 0 && (
                        <div className="mt-2">
                          <div className="font-medium text-destructive">Errors:</div>
                          <ul className="text-sm list-disc list-inside">
                            {importResult.errors.map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Import Button */}
                <Button 
                  onClick={handleImport} 
                  disabled={!selectedFile || loading}
                  className="w-full"
                >
                  <Upload size={16} className="mr-2" />
                  {loading ? 'Importing...' : 'Import Departments'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}