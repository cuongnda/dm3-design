package authsvc

// PluginInfo describes an available plugin that can be enabled per tenant.
type PluginInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	IsCore      bool   `json:"is_core"`
}

// AvailablePlugins is the authoritative registry of all plugins.
var AvailablePlugins = []PluginInfo{
	{ID: "core", Name: "Core Access Control", Description: "Base platform: doors, identities, credentials, access rules", Category: "platform", IsCore: true},
	{ID: "visitor", Name: "Visitor Management", Description: "Pre-registration, walk-in, approval workflows, watchlist", Category: "operate", IsCore: false},
	{ID: "parking", Name: "Parking Management", Description: "Vehicle tracking, parking zones, permits", Category: "operate", IsCore: false},
	{ID: "intercom", Name: "Intercom", Description: "Video intercom, remote door unlock, call routing", Category: "smart", IsCore: false},
	{ID: "smart_building", Name: "Smart Building", Description: "HVAC, lighting, occupancy analytics", Category: "smart", IsCore: false},
}

// validPluginIDs is a lookup set built from the registry.
var validPluginIDs = func() map[string]bool {
	m := make(map[string]bool, len(AvailablePlugins))
	for _, p := range AvailablePlugins {
		m[p.ID] = true
	}
	return m
}()

// IsValidPlugin checks if a plugin ID exists in the registry.
func IsValidPlugin(id string) bool {
	return validPluginIDs[id]
}
