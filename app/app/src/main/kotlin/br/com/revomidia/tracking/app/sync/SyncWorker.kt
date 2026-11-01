package br.com.revomidia.tracking.app.sync

import android.content.Context
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
import br.com.revomidia.tracking.app.TrackingApp
import br.com.revomidia.tracking.app.data.SyncResult
import java.util.concurrent.TimeUnit

/**
 * Segunda via do envio, para quando o app está fechado. Com o app aberto, quem envia é o próprio app
 * ([br.com.revomidia.tracking.app.data.Syncer]), sem depender do agendador do sistema — alguns fabricantes
 * (Xiaomi, por exemplo) seguram ou adiam tarefas em segundo plano.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result =
        when (val r = (applicationContext as TrackingApp).container.syncer.sync()) {
            is SyncResult.Done -> if (r.pending > 0) Result.retry() else Result.success()
            is SyncResult.Offline -> Result.retry()
            SyncResult.Unauthorized -> Result.failure()
        }

    companion object {
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /**
         * Pede um envio. REPLACE: o pedido novo substitui o que estiver esperando (inclusive um que esteja
         * aguardando nova tentativa com espera longa). Se cancelar um envio no meio, o reenvio é inofensivo:
         * o núcleo responde `duplicate`.
         */
        fun kick(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(network)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync", ExistingWorkPolicy.REPLACE, req)
        }

        /** Rede de segurança: a cada 15 min (mínimo do Android), mesmo que nada tenha chamado [kick]. */
        fun schedulePeriodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(network).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("sync-periodic", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
