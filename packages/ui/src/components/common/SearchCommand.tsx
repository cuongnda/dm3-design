import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '../ui/command';
import { useNavigate } from 'react-router-dom';
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
            🕐 Main Entrance Door
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.identities)}>
            🕐 Nguyen Van A — Employee
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.users)}>
            🕐 User Management
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Quick Actions">
          <CommandItem>⚡ Lock all doors</CommandItem>
          <CommandItem onSelect={() => go(ROUTES.departments)}>
            ⚡ Manage departments
          </CommandItem>
          <CommandItem onSelect={() => go(ROUTES.users)}>
            ⚡ Add new user
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Pages">
          <CommandItem onSelect={() => go(ROUTES.dashboard)}>📊 Dashboard</CommandItem>
          <CommandItem onSelect={() => go(ROUTES.accessControl)}>🚪 Access Control</CommandItem>
          <CommandItem onSelect={() => go(ROUTES.users)}>👤 Users</CommandItem>
          <CommandItem onSelect={() => go(ROUTES.departments)}>🏢 Departments</CommandItem>
          <CommandItem onSelect={() => go(ROUTES.devices)}>💻 Devices</CommandItem>
          <CommandItem onSelect={() => go(ROUTES.settings)}>⚙️ Settings</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
