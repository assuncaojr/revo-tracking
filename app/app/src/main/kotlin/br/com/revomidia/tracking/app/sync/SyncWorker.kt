package br.com.revomidia.tracking.app.sync

import android.content.Context
import android.os.BatteryManager
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import br.com.revomidia.tracking.app.BuildConfig
import br.com.revomidia.tracking.app.TrackingApp
import br.com.revomidia.tracking.app.data.Clock
import br.com.revomidia.tracking.app.net.Unauthorized
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Envia a fila ao núcleo em lotes de até 50, até esvaziar. Sem rede, o WorkManager espera;
 * com falha de rede, tenta de novo com espera crescente. A fila só perde item confirmado.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val c = (applicationContext as TrackingApp).container
        if (!c.store.enrolled) return Result.success() // sem token: nada a fazer até novo cadastro
        val api = c.api
        return try {
            for (round in 1..MAX_BATCHES_PER_RUN) {
                val batch = c.queue.pending(50)
                if (batch.isEmpty()) break
                try {
                    c.queue.apply(batch, api.sendBatch(batch.map { it.json }))
                } catch (e: IOException) {
                    c.queue.failed(batch, e.message ?: e.javaClass.simpleName)
                    throw e
                }
            }
            c.store.lastSyncAt = Clock.now()
            api.heartbeat(c.queue.pendingCount(), battery(), BuildConfig.VERSION_NAME)
            if (c.queue.pendingCount() > 0) Result.retry() else Result.success()
        } catch (e: Unauthorized) {
            c.store.clearToken()
            Result.failure()
        } catch (e: IOException) {
            Result.retry()
        }
    }

    private fun battery(): Int? =
        (applicationContext.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager)
            ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }

    companion object {
        private const val MAX_BATCHES_PER_RUN = 20
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** Logo após cada entrevista e no botão "Enviar agora". Encadeia se já houver um envio rodando. */
        fun kick(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(network)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync", ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }

        /** Rede de segurança: a cada 15 min (mínimo do Android), mesmo que nada tenha chamado [kick]. */
        fun schedulePeriodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(network).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("sync-periodic", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
