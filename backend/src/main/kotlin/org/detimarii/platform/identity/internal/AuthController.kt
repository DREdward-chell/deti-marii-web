package org.detimarii.platform.identity.internal

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.detimarii.platform.identity.CurrentAccount
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.AuthenticationException
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy
import org.springframework.security.web.context.SecurityContextRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice

data class RegistrationRequest(
    @field:NotBlank @field:Email(message = "Укажите корректный email.") @field:Size(max = 254)
    val email: String,
    @field:NotBlank(message = "Введите пароль.")
    @field:Size(min = 15, max = 128, message = "Пароль должен содержать от 15 до 128 символов.")
    val password: String,
)

data class LoginRequest(
    @field:NotBlank @field:Size(max = 254) val email: String,
    @field:NotBlank @field:Size(max = 128) val password: String,
)

data class SessionView(val account: AccountView?)
data class CsrfView(val headerName: String, val token: String)

@RestController
@RequestMapping("/api/v1/auth")
class AuthController(
    private val accounts: AccountService,
    private val authenticationManager: AuthenticationManager,
    private val securityContexts: SecurityContextRepository,
    private val sessionAuthenticationStrategy: SessionAuthenticationStrategy,
    private val currentAccount: CurrentAccount,
    private val rateLimiter: AuthRateLimiter,
) {
    @GetMapping("/csrf")
    fun csrf(token: CsrfToken) = CsrfView(token.headerName, token.token)

    @GetMapping("/session")
    fun session(authentication: Authentication?): SessionView = SessionView(
        if (authentication == null || authentication is AnonymousAuthenticationToken) null
        else accounts.get(currentAccount.id()),
    )

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    fun register(@Valid @RequestBody body: RegistrationRequest, request: HttpServletRequest): AccountView {
        rateLimiter.check(request.remoteAddr)
        return accounts.register(body.email, body.password)
    }

    @PostMapping("/login")
    fun login(
        @Valid @RequestBody body: LoginRequest,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AccountView {
        rateLimiter.check(request.remoteAddr)
        val authentication = authenticationManager.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(normalizeEmail(body.email), body.password),
        )
        sessionAuthenticationStrategy.onAuthentication(authentication, request, response)
        val context = SecurityContextHolder.createEmptyContext()
        context.authentication = authentication
        SecurityContextHolder.setContext(context)
        securityContexts.saveContext(context, request, response)
        return accounts.get(currentAccount.id())
    }
}

@RestControllerAdvice(assignableTypes = [AuthController::class])
class AuthErrorHandler {
    @ExceptionHandler(AuthenticationException::class)
    fun failedLogin(): ProblemDetail = ProblemDetail.forStatusAndDetail(
        HttpStatus.UNAUTHORIZED, "Не удалось войти. Проверьте email и пароль.",
    )

    @ExceptionHandler(AuthRateLimitExceeded::class)
    fun tooManyAttempts(exception: AuthRateLimitExceeded): ResponseEntity<ProblemDetail> =
        ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", exception.retryAfterSeconds.toString())
            .body(ProblemDetail.forStatusAndDetail(
                HttpStatus.TOO_MANY_REQUESTS, "Слишком много попыток. Подождите минуту и попробуйте снова.",
            ))
}
