package br.com.revomidia.tracking.app.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Resposta de GET /api/device/bootstrap: tudo para trabalhar offline. */
@Serializable
data class Bootstrap(
    @SerialName("server_time") val serverTime: String,
    @SerialName("min_app_version") val minAppVersion: String,
    val campaign: CampaignInfo,
    val device: DeviceInfo,
    val questionnaire: JsonElement?,
    val points: List<PointInfo>,
    val interviewers: List<InterviewerInfo>,
)

@Serializable
data class CampaignInfo(val id: String, val name: String, val timezone: String)

@Serializable
data class DeviceInfo(val id: String, val label: String)

@Serializable
data class PointInfo(
    val id: String,
    val name: String,
    val kind: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val neighborhood: String,
    val stratum: String? = null,
)

@Serializable
data class InterviewerInfo(
    val id: String,
    val name: String,
    @SerialName("pin_salt") val pinSalt: String,
    @SerialName("pin_hash") val pinHash: String,
    @SerialName("pin_iterations") val pinIterations: Int,
)

@Serializable
data class EnrollResponse(
    @SerialName("device_id") val deviceId: String,
    @SerialName("campaign_id") val campaignId: String,
    val label: String,
    val token: String,
)

@Serializable
data class BatchResult(val id: String? = null, val status: String, val errors: List<String> = emptyList())

@Serializable
data class BatchResponse(val results: List<BatchResult>)
