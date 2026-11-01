package br.com.revomidia.tracking.app

import android.app.Application
import android.content.Context
import android.os.BatteryManager
import androidx.room.Room
import br.com.revomidia.tracking.app.data.Syncer
import br.com.revomidia.tracking.app.data.AppDb
import br.com.revomidia.tracking.app.data.DeviceStore
import br.com.revomidia.tracking.app.data.InterviewQueue
import br.com.revomidia.tracking.app.location.Locator
import br.com.revomidia.tracking.app.net.ApiClient
import br.com.revomidia.tracking.app.sync.SyncWorker

class TrackingApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        SyncWorker.schedulePeriodic(this)
    }
}

/** Dependências do app, montadas à mão (poucas peças; sem framework de injeção). */
class AppContainer(context: Context) {
    val store = DeviceStore(context)
    val db: AppDb = Room.databaseBuilder(context, AppDb::class.java, "tracking.db").build()
    val queue = InterviewQueue(db.queue())
    val drafts = db.drafts()
    val api = ApiClient(BuildConfig.API_BASE_URL, store::token)
    val locator = Locator(context)
    val syncer = Syncer(store, queue, api, battery = {
        (context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager)
            ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }
    }, appVersion = BuildConfig.VERSION_NAME)
}
