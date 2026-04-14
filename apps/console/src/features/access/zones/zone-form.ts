import type { Zone, ZoneFormData } from './types';

// Plain-string form state used by the zone create/edit page. Numeric fields
// are kept as strings so empty inputs round-trip cleanly; conversion happens
// in zoneFormToData / zoneToForm at the API boundary.
export interface ZoneFormState {
  name: string;
  description: string;
  parent_id: string;
  timezone: string;
  address: string;
  building: string;
  floor: string;
  geo_lat: string;
  geo_lng: string;
  map_image_url: string;
  map_image_width: string;
  map_image_height: string;
}

export const emptyZoneForm: ZoneFormState = {
  name: '',
  description: '',
  parent_id: '',
  timezone: 'Asia/Ho_Chi_Minh',
  address: '',
  building: '',
  floor: '',
  geo_lat: '',
  geo_lng: '',
  map_image_url: '',
  map_image_width: '',
  map_image_height: '',
};

export function zoneToForm(zone: Zone): ZoneFormState {
  return {
    name: zone.name,
    description: zone.description ?? '',
    parent_id: zone.parent_id ?? '',
    timezone: zone.timezone ?? 'Asia/Ho_Chi_Minh',
    address: zone.address ?? '',
    building: zone.building ?? '',
    floor: zone.floor ?? '',
    geo_lat: zone.geo_lat != null ? String(zone.geo_lat) : '',
    geo_lng: zone.geo_lng != null ? String(zone.geo_lng) : '',
    map_image_url: zone.map_image_url ?? '',
    map_image_width: zone.map_width != null ? String(zone.map_width) : '',
    map_image_height: zone.map_height != null ? String(zone.map_height) : '',
  };
}

export function zoneFormToData(form: ZoneFormState): ZoneFormData {
  return {
    name: form.name,
    description: form.description || undefined,
    parent_id: form.parent_id || undefined,
    timezone: form.timezone || undefined,
    address: form.address || undefined,
    building: form.building || undefined,
    floor: form.floor || undefined,
    geo_lat: form.geo_lat === '' ? undefined : Number(form.geo_lat),
    geo_lng: form.geo_lng === '' ? undefined : Number(form.geo_lng),
    map_image_url: form.map_image_url || undefined,
    map_image_width: form.map_image_width === '' ? undefined : Number(form.map_image_width),
    map_image_height: form.map_image_height === '' ? undefined : Number(form.map_image_height),
    map_metadata: { origin: 'top-left' },
  };
}
