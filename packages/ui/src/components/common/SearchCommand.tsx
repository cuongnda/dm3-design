import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '../ui/command';
import { useNavigate } from 'react-router-dom';
import { Building2, Clock, Cpu, DoorOpen, LayoutDashboard, Lock, Settings, UserPlus, Users, Zap } from 'lucide-react';
import { ROUTES } from '@/lib/constants';

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const navigate = useNavigate();

  const go = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search anything..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Recent">
          <CommandItem onSelect={() => go(ROUTES.accessControl)}>
            <Clock className="mr-2 h-4 w-4" /> Main Entrance Door
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.users)}>
            <Clock className="mr-2 h-4 w-4" /> User Management
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Quick Actions">
          <CommandItem>
            <Lock className="mr-2 h-4 w-4" /> Lock all doors
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.departments)}>
            <Zap className="mr-2 h-4 w-4" /> Manage departments
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.users)}>
            <UserPlus className="mr-2 h-4 w-4" /> Add new user
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => go(ROUTES.dashboard)}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.accessControl)}>
            <DoorOpen className="mr-2 h-4 w-4" /> Access Control
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.users)}>
            <Users className="mr-2 h-4 w-4" /> Users
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.departments)}>
            <Building2 className="mr-2 h-4 w-4" /> Departments
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.devices)}>
            <Cpu className="mr-2 h-4 w-4" /> Devices
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.settings)}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
