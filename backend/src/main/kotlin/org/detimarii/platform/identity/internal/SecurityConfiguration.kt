package org.detimarii.platform.identity.internal

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.ProviderManager
import org.springframework.security.authentication.dao.DaoAuthenticationProvider
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.security.crypto.password.DelegatingPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.security.web.context.SecurityContextRepository
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy
import org.springframework.security.web.csrf.CsrfTokenRepository
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository

@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
class SecurityConfiguration {
    @Bean
    fun securityFilterChain(
        http: HttpSecurity,
        securityContexts: SecurityContextRepository,
        csrfTokens: CsrfTokenRepository,
    ): SecurityFilterChain {
        http
            .authorizeHttpRequests {
                it.requestMatchers(HttpMethod.GET, "/api/v1/system/info", "/actuator/health", "/actuator/health/**",
                    "/api/v1/auth/csrf", "/api/v1/auth/session")
                    .permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login").permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/v1/volunteers/me").hasRole("VOLUNTEER")
                    .requestMatchers(HttpMethod.PUT, "/api/v1/volunteers/me").hasRole("VOLUNTEER")
                    .anyRequest().denyAll()
            }
            .csrf { it.csrfTokenRepository(csrfTokens) }
            .securityContext { it.securityContextRepository(securityContexts).requireExplicitSave(true) }
            .requestCache { it.disable() }
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .logout {
                it.logoutUrl("/api/v1/auth/logout")
                    .invalidateHttpSession(true)
                    .deleteCookies("JSESSIONID")
                    .logoutSuccessHandler { _, response, _ -> response.status = HttpStatus.NO_CONTENT.value() }
            }
            .exceptionHandling {
                it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
                    .accessDeniedHandler { _, response, _ ->
                        response.status = HttpStatus.FORBIDDEN.value()
                        response.contentType = "application/problem+json"
                        response.writer.write("""{"status":403,"detail":"Действие недоступно. Обновите страницу и попробуйте снова."}""")
                    }
            }
        return http.build()
    }

    @Bean
    fun passwordEncoder(): PasswordEncoder {
        val encoder = Pbkdf2PasswordEncoder("", 16, 600_000, Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256)
        return DelegatingPasswordEncoder("pbkdf2-sha256-v1", mapOf("pbkdf2-sha256-v1" to encoder))
    }

    @Bean
    fun userDetailsService(accounts: AccountRepository): UserDetailsService = UserDetailsService { email ->
        val account = accounts.findCredentials(normalizeEmail(email)) ?: throw UsernameNotFoundException("Invalid credentials")
        User.withUsername(account.id.toString())
            .password(account.passwordHash)
            .roles(*accounts.roles(account.id).map { it.name }.toTypedArray())
            .build()
    }

    @Bean
    fun authenticationManager(users: UserDetailsService, passwords: PasswordEncoder): AuthenticationManager =
        ProviderManager(DaoAuthenticationProvider(users).apply { setPasswordEncoder(passwords) })

    @Bean
    fun securityContexts(): SecurityContextRepository = HttpSessionSecurityContextRepository()

    @Bean
    fun csrfTokens(): CsrfTokenRepository = HttpSessionCsrfTokenRepository()

    @Bean
    fun sessionAuthenticationStrategy(csrfTokens: CsrfTokenRepository): SessionAuthenticationStrategy =
        CompositeSessionAuthenticationStrategy(listOf(
            ChangeSessionIdAuthenticationStrategy(),
            CsrfAuthenticationStrategy(csrfTokens),
        ))
}
