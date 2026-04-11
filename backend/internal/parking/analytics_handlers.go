package parking

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/duali/dm3-backend/internal/authsvc"
	"github.com/duali/dm3-backend/pkg/httputil"
)

// ParkingDashboardResponse is the real-time overview data.
type ParkingDashboardResponse struct {
	ActiveSessions   int                `json:"active_sessions"`
	TotalSpaces      int                `json:"total_spaces"`
	OccupiedSpaces   int                `json:"occupied_spaces"`
	AvailableSpaces  int                `json:"available_spaces"`
	OccupancyPercent float64            `json:"occupancy_percent"`
	EnteredToday     int                `json:"entered_today"`
	ExitedToday      int                `json:"exited_today"`
	RevenueToday     float64            `json:"revenue_today"`
	PendingPayments  int                `json:"pending_payments"`
	DisputedSessions int                `json:"disputed_sessions"`
	ZoneOccupancy    []ZoneOccupancyDTO `json:"zone_occupancy"`
}

// ZoneOccupancyDTO is per-zone occupancy data.
type ZoneOccupancyDTO struct {
	ZoneID      string  `json:"zone_id"`
	ZoneName    string  `json:"zone_name"`
	LotID       string  `json:"lot_id"`
	TotalSpaces int     `json:"total_spaces"`
	Occupied    int     `json:"occupied"`
	Available   int     `json:"available"`
	Percent     float64 `json:"percent"`
}

// ParkingAnalyticsResponse is the period-based analytics data.
type ParkingAnalyticsResponse struct {
	Period           string                  `json:"period"`
	TotalSessions    int                     `json:"total_sessions"`
	TotalRevenue     float64                 `json:"total_revenue"`
	AvgDuration      float64                 `json:"avg_duration_minutes"`
	AvgOccupancy     float64                 `json:"avg_occupancy_percent"`
	ByVehicleType    []VehicleTypeBreakdown  `json:"by_vehicle_type"`
	ByPaymentStatus  []PaymentBreakdown      `json:"by_payment_status"`
	DailyTrend       []DailyTrendDTO         `json:"daily_trend"`
	PeakHours        []PeakHourDTO           `json:"peak_hours"`
	TopPlates        []TopPlateDTO           `json:"top_plates"`
}

type VehicleTypeBreakdown struct {
	VehicleType string  `json:"vehicle_type"`
	Count       int     `json:"count"`
	Revenue     float64 `json:"revenue"`
}

type PaymentBreakdown struct {
	Status string `json:"status"`
	Count  int    `json:"count"`
}

type DailyTrendDTO struct {
	Date     string  `json:"date"`
	Sessions int     `json:"sessions"`
	Revenue  float64 `json:"revenue"`
}

type PeakHourDTO struct {
	Hour     int `json:"hour"`
	Sessions int `json:"sessions"`
}

type TopPlateDTO struct {
	PlateNumber string `json:"plate_number"`
	VehicleType string `json:"vehicle_type"`
	VisitCount  int    `json:"visit_count"`
}

// GetDashboard returns real-time parking overview.
func (h *ParkingHandlers) GetDashboard(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	dash := ParkingDashboardResponse{}

	// Total and occupied spaces
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(z.total_spaces), 0),
		        COALESCE(COUNT(s.id) FILTER (WHERE s.status = 'active'), 0)
		 FROM dm3_parking.parking_zones z
		 LEFT JOIN dm3_parking.parking_sessions s ON s.zone_id = z.id AND s.status = 'active'
		 WHERE z.tenant_id = $1::uuid AND z.status = 'active'`, cid,
	).Scan(&dash.TotalSpaces, &dash.OccupiedSpaces)
	dash.AvailableSpaces = dash.TotalSpaces - dash.OccupiedSpaces
	if dash.AvailableSpaces < 0 {
		dash.AvailableSpaces = 0
	}
	if dash.TotalSpaces > 0 {
		dash.OccupancyPercent = float64(dash.OccupiedSpaces) / float64(dash.TotalSpaces) * 100
	}
	dash.ActiveSessions = dash.OccupiedSpaces

	// Today stats
	today := time.Now().Truncate(24 * time.Hour)
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FILTER (WHERE entry_time >= $2),
		        COUNT(*) FILTER (WHERE exit_time >= $2 AND exit_time IS NOT NULL),
		        COALESCE(SUM(fee_amount) FILTER (WHERE payment_status = 'paid' AND updated_at >= $2), 0),
		        COUNT(*) FILTER (WHERE payment_status = 'pending'),
		        COUNT(*) FILTER (WHERE status = 'disputed')
		 FROM dm3_parking.parking_sessions WHERE tenant_id = $1::uuid`, cid, today,
	).Scan(&dash.EnteredToday, &dash.ExitedToday, &dash.RevenueToday, &dash.PendingPayments, &dash.DisputedSessions)

	// Per-zone occupancy
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT z.id, z.name, z.lot_id, z.total_spaces,
		        COUNT(s.id) FILTER (WHERE s.status = 'active')
		 FROM dm3_parking.parking_zones z
		 LEFT JOIN dm3_parking.parking_sessions s ON s.zone_id = z.id AND s.status = 'active'
		 WHERE z.tenant_id = $1::uuid AND z.status = 'active'
		 GROUP BY z.id ORDER BY z.name`, cid)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var zo ZoneOccupancyDTO
			if err := rows.Scan(&zo.ZoneID, &zo.ZoneName, &zo.LotID, &zo.TotalSpaces, &zo.Occupied); err == nil {
				zo.Available = zo.TotalSpaces - zo.Occupied
				if zo.Available < 0 {
					zo.Available = 0
				}
				if zo.TotalSpaces > 0 {
					zo.Percent = float64(zo.Occupied) / float64(zo.TotalSpaces) * 100
				}
				dash.ZoneOccupancy = append(dash.ZoneOccupancy, zo)
			}
		}
	}
	if dash.ZoneOccupancy == nil {
		dash.ZoneOccupancy = []ZoneOccupancyDTO{}
	}

	httputil.JSON(w, http.StatusOK, dash)
}

// GetAnalytics returns period-based parking analytics.
func (h *ParkingHandlers) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	cid := authsvc.CompanyIDFromContext(r.Context())
	if cid == "" {
		httputil.Error(w, http.StatusForbidden, "company context required")
		return
	}

	period := r.URL.Query().Get("period")
	days := 7
	switch period {
	case "30d":
		days = 30
	case "90d":
		days = 90
	default:
		period = "7d"
	}
	since := time.Now().AddDate(0, 0, -days)

	analytics := ParkingAnalyticsResponse{Period: period}

	// Totals
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*), COALESCE(SUM(fee_amount), 0),
		        COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(exit_time, now()) - entry_time)) / 60), 0)
		 FROM dm3_parking.parking_sessions
		 WHERE tenant_id = $1::uuid AND entry_time >= $2`, cid, since,
	).Scan(&analytics.TotalSessions, &analytics.TotalRevenue, &analytics.AvgDuration)

	// By vehicle type
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT vehicle_type, COUNT(*), COALESCE(SUM(fee_amount), 0)
		 FROM dm3_parking.parking_sessions
		 WHERE tenant_id = $1::uuid AND entry_time >= $2
		 GROUP BY vehicle_type ORDER BY COUNT(*) DESC`, cid, since)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var vt VehicleTypeBreakdown
			if rows.Scan(&vt.VehicleType, &vt.Count, &vt.Revenue) == nil {
				analytics.ByVehicleType = append(analytics.ByVehicleType, vt)
			}
		}
	}
	if analytics.ByVehicleType == nil {
		analytics.ByVehicleType = []VehicleTypeBreakdown{}
	}

	// By payment status
	rows2, err := h.db.Pool.Query(r.Context(),
		`SELECT COALESCE(payment_status, 'none'), COUNT(*)
		 FROM dm3_parking.parking_sessions
		 WHERE tenant_id = $1::uuid AND entry_time >= $2
		 GROUP BY payment_status ORDER BY COUNT(*) DESC`, cid, since)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var pb PaymentBreakdown
			if rows2.Scan(&pb.Status, &pb.Count) == nil {
				analytics.ByPaymentStatus = append(analytics.ByPaymentStatus, pb)
			}
		}
	}
	if analytics.ByPaymentStatus == nil {
		analytics.ByPaymentStatus = []PaymentBreakdown{}
	}

	// Daily trend
	rows3, err := h.db.Pool.Query(r.Context(),
		fmt.Sprintf(`SELECT entry_time::date AS day, COUNT(*), COALESCE(SUM(fee_amount), 0)
		 FROM dm3_parking.parking_sessions
		 WHERE tenant_id = $1::uuid AND entry_time >= $2
		 GROUP BY day ORDER BY day LIMIT %d`, days), cid, since)
	if err == nil {
		defer rows3.Close()
		for rows3.Next() {
			var dt DailyTrendDTO
			var day time.Time
			if rows3.Scan(&day, &dt.Sessions, &dt.Revenue) == nil {
				dt.Date = day.Format("2006-01-02")
				analytics.DailyTrend = append(analytics.DailyTrend, dt)
			}
		}
	}
	if analytics.DailyTrend == nil {
		analytics.DailyTrend = []DailyTrendDTO{}
	}

	// Peak hours
	rows4, err := h.db.Pool.Query(r.Context(),
		`SELECT EXTRACT(HOUR FROM entry_time)::int, COUNT(*)
		 FROM dm3_parking.parking_sessions
		 WHERE tenant_id = $1::uuid AND entry_time >= $2
		 GROUP BY 1 ORDER BY 2 DESC LIMIT 24`, cid, since)
	if err == nil {
		defer rows4.Close()
		for rows4.Next() {
			var ph PeakHourDTO
			if rows4.Scan(&ph.Hour, &ph.Sessions) == nil {
				analytics.PeakHours = append(analytics.PeakHours, ph)
			}
		}
	}
	if analytics.PeakHours == nil {
		analytics.PeakHours = []PeakHourDTO{}
	}

	// Top plates
	rows5, err := h.db.Pool.Query(r.Context(),
		`SELECT plate_number, vehicle_type, COUNT(*) AS cnt
		 FROM dm3_parking.parking_sessions
		 WHERE tenant_id = $1::uuid AND entry_time >= $2
		 GROUP BY plate_number, vehicle_type ORDER BY cnt DESC LIMIT 10`, cid, since)
	if err == nil {
		defer rows5.Close()
		for rows5.Next() {
			var tp TopPlateDTO
			if rows5.Scan(&tp.PlateNumber, &tp.VehicleType, &tp.VisitCount) == nil {
				analytics.TopPlates = append(analytics.TopPlates, tp)
			}
		}
	}
	if analytics.TopPlates == nil {
		analytics.TopPlates = []TopPlateDTO{}
	}

	if err != nil {
		slog.Debug("analytics query partial error", "error", err)
	}

	httputil.JSON(w, http.StatusOK, analytics)
}
