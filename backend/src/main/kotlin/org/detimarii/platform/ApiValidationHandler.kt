package org.detimarii.platform

import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class ApiValidationHandler {
    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun invalidRequest(exception: MethodArgumentNotValidException): ProblemDetail =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Проверьте заполнение полей.").apply {
            setProperty("errors", exception.bindingResult.fieldErrors.associate {
                it.field to (it.defaultMessage ?: "Некорректное значение")
            })
        }
}
