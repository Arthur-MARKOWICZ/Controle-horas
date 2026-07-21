package com.controle_horas.Controle_horas.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final String TOO_MANY_REQUESTS_JSON =
            "{\"success\":false,\"message\":\"Too many requests. Please try again later.\",\"data\":null}";
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "\"email\"\\s*:\\s*\"([^\"]+)\"",
            Pattern.CASE_INSENSITIVE);

    private final AuthRateLimitService authRateLimitService;

    public AuthRateLimitFilter(AuthRateLimitService authRateLimitService) {
        this.authRateLimitService = authRateLimitService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!HttpMethod.POST.matches(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        return !"/api/auth/login".equals(path) && !"/api/auth/register".equals(path);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        CachedBodyHttpServletRequest cachedRequest = new CachedBodyHttpServletRequest(request);
        String clientIp = resolveClientIp(cachedRequest);
        String path = cachedRequest.getRequestURI();
        String key = clientIp + "|" + path;

        if ("/api/auth/login".equals(path)) {
            String email = extractEmail(cachedRequest.getCachedBody());
            if (email != null && !email.isBlank()) {
                key = key + "|" + email.trim().toLowerCase();
            }
        }

        if (!authRateLimitService.tryConsume(key)) {
            writeTooManyRequests(response);
            return;
        }

        filterChain.doFilter(cachedRequest, response);
    }

    private void writeTooManyRequests(HttpServletResponse response) throws IOException {
        response.setStatus(429);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getOutputStream().write(TOO_MANY_REQUESTS_JSON.getBytes(StandardCharsets.UTF_8));
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        String remoteAddr = request.getRemoteAddr();
        return remoteAddr != null ? remoteAddr : "unknown";
    }

    private String extractEmail(byte[] body) {
        if (body == null || body.length == 0) {
            return null;
        }
        String content = new String(body, StandardCharsets.UTF_8);
        Matcher matcher = EMAIL_PATTERN.matcher(content);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static final class CachedBodyHttpServletRequest extends HttpServletRequestWrapper {

        private final byte[] cachedBody;

        private CachedBodyHttpServletRequest(HttpServletRequest request) throws IOException {
            super(request);
            this.cachedBody = request.getInputStream().readAllBytes();
        }

        private byte[] getCachedBody() {
            return cachedBody;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream inputStream = new ByteArrayInputStream(cachedBody);
            return new ServletInputStream() {
                @Override
                public boolean isFinished() {
                    return inputStream.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener readListener) {
                    // Not used for synchronous request handling.
                }

                @Override
                public int read() {
                    return inputStream.read();
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }
}
