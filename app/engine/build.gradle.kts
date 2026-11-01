// Motor do questionário em Kotlin puro, sem Android SDK.
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    api(project(":core:model"))
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.json.schema.validator)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.test {
    useJUnitPlatform()
    systemProperty("contracts.dir", rootProject.file("../contracts").absolutePath)
    // Entrevistas produzidas pelo motor; o api/tests as envia à API (prova ponta a ponta do contrato).
    val produced = layout.buildDirectory.dir("produced").get().asFile
    systemProperty("produced.dir", produced.absolutePath)
    doFirst { produced.deleteRecursively(); produced.mkdirs() }
}
