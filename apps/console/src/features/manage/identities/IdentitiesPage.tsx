import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Eye, Edit, Trash2, User } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  AppModal,
  Input,
  Label,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@dm3/ui';

interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: string;
  last_access: string;
}

const mockPersons: Person[] = [
  {
    id: '1',
    name: 'John Smith',
    email: 'john.smith@company.com',
    phone: '+1234567890',
    department: 'Engineering',
    role: 'Developer',
    status: 'active',
    last_access: '2026-04-04 17:30:00'
  },
  {
    id: '2',
    name: 'Jane Doe',
    email: 'jane.doe@company.com',
    phone: '+1234567891',
    department: 'Marketing',
    role: 'Manager',
    status: 'active',
    last_access: '2026-04-04 16:45:00'
  },
  {
    id: '3',
    name: 'Bob Wilson',
    email: 'bob.wilson@company.com',
    phone: '+1234567892',
    department: 'Sales',
    role: 'Representative',
    status: 'inactive',
    last_access: '2026-04-03 14:20:00'
  }
];

export function IdentitiesPage() {
  const { t } = useTranslation();
  const [persons] = useState<Person[]>(mockPersons);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredPersons = persons.filter(person =>
    person.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    person.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    person.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const activeCount = persons.filter(p => p.status === 'active').length;
  const inactiveCount = persons.filter(p => p.status === 'inactive').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Identity Management</h1>
          <p className="text-muted-foreground">Manage people and their access credentials</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus size={16} className="mr-2" />
          Add Person
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <User size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{persons.length}</div>
                <div className="text-sm text-muted-foreground">Total People</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <User size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{activeCount}</div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <User size={20} className="text-gray-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">{inactiveCount}</div>
                <div className="text-sm text-muted-foreground">Inactive</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search people by name, email, or department..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* People Table */}
      <Card>
        <CardHeader>
          <CardTitle>People ({filteredPersons.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Access</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPersons.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium">{person.name}</TableCell>
                  <TableCell>{person.email}</TableCell>
                  <TableCell>{person.phone}</TableCell>
                  <TableCell>{person.department}</TableCell>
                  <TableCell>{person.role}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(person.status)}`}>
                      {person.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {person.last_access}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" title="View">
                        <Eye size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" title="Edit">
                        <Edit size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" title="Delete">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredPersons.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No people found</p>
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePersonModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  );
}

function CreatePersonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    department: '',
    role: ''
  });

  const save = () => {
    console.log('Creating person:', formData);
    onClose();
  };

  const valid = Boolean(formData.name.trim() && formData.email.trim());

  return (
    <AppModal
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="Add Person"
      size="md"
      submitDisabled={!valid}
      showCancelButton
      cancelLabel="Cancel"
      primaryAction={{ label: 'Add Person', onClick: save }}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="create-person-name">Name *</Label>
          <Input
            id="create-person-name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="John Smith"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="create-person-email">Email *</Label>
          <Input
            id="create-person-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            placeholder="john.smith@company.com"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="create-person-phone">Phone</Label>
          <Input
            id="create-person-phone"
            type="text"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="+1234567890"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="create-person-dept">Department</Label>
          <Input
            id="create-person-dept"
            type="text"
            value={formData.department}
            onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
            placeholder="Engineering"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="create-person-role">Role</Label>
          <Input
            id="create-person-role"
            type="text"
            value={formData.role}
            onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
            placeholder="Developer"
          />
        </div>
      </div>
    </AppModal>
  );
}