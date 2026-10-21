package org.detimarii.platform.identity.internal

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import jakarta.validation.constraints.Pattern
import org.detimarii.platform.identity.CurrentAccount
import org.detimarii.platform.identity.LoginCodeDeliveryUnavailable
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

data class SessionView(val account: AccountView?, val verification: EmailVerification? = null)
data class CsrfView(val headerName: String, val token: String)
data class VerifyEmailCodeRequest(@field:Pattern(regexp = "[0-9]{6}", message = "Введите шесть цифр из письма.") val code: String)

@RestController
@RequestMapping("/api/v1/auth")
class AuthController(
    private val accounts: AccountService,
    private val authenticationManager: AuthenticationManager,
    private val securityContexts: SecurityContextRepository,
    private val sessionAuthenticationStrategy: SessionAuthenticationStrategy,
    private val currentAccount: CurrentAccount,
    private val rateLimiter: AuthRateLimiter,
    private val emailCodes: EmailCodeService,
) {
    @GetMapping("/csrf")
    fun csrf(token: CsrfToken) = CsrfView(token.headerName, token.token)

    @GetMapping("/session")
    fun session(authentication: Authentication?, request: HttpServletRequest): SessionView = SessionView(
        if (authentication == null || authentication is AnonymousAuthenticationToken) null
        else accounts.get(currentAccount.id()),
        emailCodes.view(request.getSession(false)),
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
    ): ResponseEntity<Any> {
        rateLimiter.check(request.remoteAddr)
        val authentication = authenticationManager.authenticate(
            UsernamePasswordAuthenticationToken.unauthenticated(normalizeEmail(body.email), body.password),
        )
        // Successful password verification starts a new login, clearing any prior account/challenge.
        sessionAuthenticationStrategy.onAuthentication(authentication, request, response)
        SecurityContextHolder.clearContext()
        securityContexts.saveContext(SecurityContextHolder.createEmptyContext(), request, response)
        val session = request.getSession(true)
        emailCodes.clear(session)
        val roles = authentication.authorities.map { it.authority }.toSet()
        if ("ROLE_COORDINATOR" in roles || "ROLE_ADMIN" in roles) {
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(emailCodes.begin(authentication, session))
        }
        return ResponseEntity.ok(completeLogin(authentication, request, response))
    }

    @PostMapping("/email-code/verify")
    fun verifyCode(
        @Valid @RequestBody body: VerifyEmailCodeRequest,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AccountView {
        rateLimiter.check(request.remoteAddr)
        val session = request.getSession(false)
            ?: throw org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED, "Начните вход заново.")
        return completeLogin(emailCodes.verify(session, body.code), request, response)
    }

    @PostMapping("/email-code/resend")
    fun resendCode(request: HttpServletRequest): EmailVerification {
        rateLimiter.check(request.remoteAddr)
        val session = request.getSession(false)
            ?: throw org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED, "Начните вход заново.")
        return emailCodes.resend(session)
    }

    private fun completeLogin(
        authentication: Authentication,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): AccountView {
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
    @ExceptionHandler(LoginCodeDeliveryUnavailable::class)
    fun deliveryUnavailable(): ProblemDetail = ProblemDetail.forStatusAndDetail(
        HttpStatus.SERVICE_UNAVAILABLE, "Не удалось отправить код. Попробуйте войти через минуту.",
    )
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
