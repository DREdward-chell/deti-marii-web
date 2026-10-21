package org.detimarii.platform

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

@Configuration(proxyBeanMethods = false)
class PlatformConfiguration {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}
