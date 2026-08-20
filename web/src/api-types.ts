export type ApiListResponse<T> = {
  data: T[]
  current_page?: number
  last_page?: number
  per_page?: number
  total?: number
}

export type Medicine = {
  id: number
  name_en: string
  name_ar: string
  manufacturer?: string
  active_ingredient?: string
  form?: string
  dosage?: string
  pack_size?: string
  administration_route?: string
  code?: string
  image_url?: string
  description?: string
  indications?: string
  directions?: string
  side_effects?: string
  warnings?: string
  contraindications?: string
  drug_interactions?: string
  storage_instructions?: string
  prescription_required: boolean
  is_active?: boolean
}

export type NotificationRecord = {
  id: string | number
  type?: string
  data?: unknown
  read_at?: string | null
  created_at?: string
}

export type DashboardMetrics = Record<string, number>

export type DashboardAlert = {
  key: string
  message: string
  severity?: string
  count?: number
}

export type DashboardResponse = {
  metrics: DashboardMetrics
  alerts?: DashboardAlert[]
}
