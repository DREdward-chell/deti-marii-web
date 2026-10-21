package org.detimarii.platform.identity

/** Delivery port. Codes must never be returned to the client or written to application logs. */
interface LoginCodeSender {
    fun send(email: String, code: String)
}

class LoginCodeDeliveryUnavailable : RuntimeException()
