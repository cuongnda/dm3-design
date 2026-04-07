package authsvc

import (
	"net/http"

	"github.com/duali/dm3-backend/pkg/httputil"
)

// ─── System Stats ────────────────────────────────────────────────────────────

type systemStats struct {
	Companies   companyStat `json:"companies"`
	Users       userStat    `json:"users"`
	Devices     deviceStat  `json:"devices"`
	RecentStats recentStat  `json:"recent"`
}

type companyStat struct {
	Total     int64 `json:"total"`
	Active    int64 `json:"active"`
	Suspended int64 `json:"suspended"`
}

type userStat struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Inactive int64 `json:"inactive"`
}

type deviceStat struct {
	Total    int64 `json:"total"`
	Online   int64 `json:"online"`
	Offline  int64 `json:"offline"`
}

type recentStat struct {
	NewCompanies7d int64 `json:"new_companies_7d"`
	NewUsers7d     int64 `json:"new_users_7d"`
	NewDevices7d   int64 `json:"new_devices_7d"`
}

func (h *Handlers) SystemStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var stats systemStats

	// Company counts
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*), 
		 COUNT(*) FILTER (WHERE status = 'active'),
		 COUNT(*) FILTER (WHERE status = 'suspended')
		 FROM dm3_auth.companies`,
	).Scan(&stats.Companies.Total, &stats.Companies.Active, &stats.Companies.Suspended)

	// User counts
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*),
		 COUNT(*) FILTER (WHERE status = 'active'),
		 COUNT(*) FILTER (WHERE status != 'active')
		 FROM dm3_auth.accounts`,
	).Scan(&stats.Users.Total, &stats.Users.Active, &stats.Users.Inactive)

	// Device counts (from device-gateway schema if available)
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*),
		 COUNT(*) FILTER (WHERE status = 'online'),
		 COUNT(*) FILTER (WHERE status != 'online')
		 FROM dm3_devices.devices`,
	).Scan(&stats.Devices.Total, &stats.Devices.Online, &stats.Devices.Offline)

	// Recent activity (last 7 days)
	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_auth.companies WHERE created_at > now() - interval '7 days'`,
	).Scan(&stats.RecentStats.NewCompanies7d)

	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_auth.accounts WHERE created_at > now() - interval '7 days'`,
	).Scan(&stats.RecentStats.NewUsers7d)

	_ = h.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM dm3_devices.devices WHERE created_at > now() - interval '7 days'`,
	).Scan(&stats.RecentStats.NewDevices7d)

	httputil.JSON(w, http.StatusOK, stats)
}
