package org.detimarii.platform.identity.internal

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.provisioning.InMemoryUserDetailsManager
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint

@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfiguration {
    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .authorizeHttpRequests {
                it.requestMatchers(HttpMethod.GET, "/api/v1/system/info", "/actuator/health", "/actuator/health/**")
                    .permitAll()
                    .anyRequest().denyAll()
            }
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .logout { it.disable() }
            .exceptionHandling {
                it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            }
        // Keep CSRF protection for the future cookie-authenticated web interface.
        return http.build()
    }

    // No generated default password or demo account. Replace when implementing identity.
    @Bean
    fun userDetailsService(): UserDetailsService = InMemoryUserDetailsManager()
}
