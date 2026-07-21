package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.AuthResponse;
import com.controle_horas.Controle_horas.dto.LoginRequest;
import com.controle_horas.Controle_horas.dto.RegisterRequest;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.UserRole;
import com.controle_horas.Controle_horas.exception.InvalidCredentialsException;
import com.controle_horas.Controle_horas.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final String BEARER_PREFIX = "Bearer ";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TokenDenylistService tokenDenylistService;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            TokenDenylistService tokenDenylistService
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenDenylistService = tokenDenylistService;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String normalizedEmail = normalizeEmail(request.email());

        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new IllegalArgumentException("Unable to complete registration");
        }

        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        // Company bootstrap: first account is a root admin (no creator) with full access
        // to users they later create under their organization.
        user.setRole(UserRole.ADMIN);
        user.setCreatedBy(null);

        User savedUser = userRepository.save(user);
        return buildAuthResponse(savedUser);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        String normalizedEmail = normalizeEmail(request.email());

        User user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid email or password");
        }

        return buildAuthResponse(user);
    }

    public void logout(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith(BEARER_PREFIX)) {
            return;
        }
        String token = authorizationHeader.substring(BEARER_PREFIX.length()).trim();
        if (token.isEmpty() || !jwtService.isTokenValid(token)) {
            return;
        }
        String tokenId = jwtService.extractTokenId(token);
        tokenDenylistService.revoke(tokenId, jwtService.extractExpiration(token));
    }

    private AuthResponse buildAuthResponse(User user) {
        String role = user.getRole().name();
        String token = jwtService.generateToken(user.getId(), user.getEmail(), role);
        return new AuthResponse(token, user.getId(), user.getName(), user.getEmail(), role);
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase();
    }
}
