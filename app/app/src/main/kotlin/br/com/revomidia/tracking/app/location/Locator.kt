package br.com.revomidia.tracking.app.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import br.com.revomidia.tracking.app.data.Clock
import br.com.revomidia.tracking.model.Location
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/** GPS pedido ao iniciar a entrevista, sem bloquear: se não vier no prazo, a entrevista segue sem (flag no_gps). */
class Locator(private val context: Context) {
    private val client = LocationServices.getFusedLocationProviderClient(context)

    fun hasPermission(): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    suspend fun current(timeoutMs: Long = 15_000): Location? {
        if (!hasPermission()) return null
        val cancel = CancellationTokenSource()
        return try {
            withTimeoutOrNull(timeoutMs) {
                client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancel.token).await()
            }?.let { Location(it.latitude, it.longitude, it.accuracy.toDouble(), Clock.now()) }
        } catch (e: Exception) {
            null
        } finally {
            cancel.cancel()
        }
    }
}
