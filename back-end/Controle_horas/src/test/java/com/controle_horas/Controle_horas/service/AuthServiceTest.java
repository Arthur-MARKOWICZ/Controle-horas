package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.controle_horas.Controle_horas.dto.AuthResponse;
import com.controle_horas.Controle_horas.dto.LoginRequest;
import com.controle_horas.Controle_horas.dto.RegisterRequest;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.exception.EmailAlreadyRegisteredException;
import com.controle_horas.Controle_horas.exception.InvalidCredentialsException;
import com.controle_horas.Controle_horas.repository.UserRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @InjectMocks
    private AuthService authService;

    private UUID userId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
    }

    @Test
    void register_shouldCreateUserAndReturnToken() {
        RegisterRequest request = new RegisterRequest("Arthur", "Arthur@Email.com", "password123");

        when(userRepository.existsByEmail("arthur@email.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hashed-password");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(userId);
            return user;
        });
        when(jwtService.generateToken(userId, "arthur@email.com")).thenReturn("jwt-token");

        AuthResponse response = authService.register(request);

        assertThat(response.token()).isEqualTo("jwt-token");
        assertThat(response.userId()).isEqualTo(userId);
        assertThat(response.name()).isEqualTo("Arthur");
        assertThat(response.email()).isEqualTo("arthur@email.com");

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        assertThat(userCaptor.getValue().getPasswordHash()).isEqualTo("hashed-password");
    }

    @Test
    void register_shouldThrowWhenEmailAlreadyExists() {
        RegisterRequest request = new RegisterRequest("Arthur", "arthur@email.com", "password123");

        when(userRepository.existsByEmail("arthur@email.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(EmailAlreadyRegisteredException.class)
                .hasMessage("Email is already registered");

        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void login_shouldReturnTokenWhenCredentialsAreValid() {
        LoginRequest request = new LoginRequest("arthur@email.com", "password123");
        User user = buildUser();

        when(userRepository.findByEmail("arthur@email.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "hashed-password")).thenReturn(true);
        when(jwtService.generateToken(userId, "arthur@email.com")).thenReturn("jwt-token");

        AuthResponse response = authService.login(request);

        assertThat(response.token()).isEqualTo("jwt-token");
        assertThat(response.email()).isEqualTo("arthur@email.com");
    }

    @Test
    void login_shouldThrowWhenEmailIsUnknown() {
        LoginRequest request = new LoginRequest("unknown@email.com", "password123");

        when(userRepository.findByEmail("unknown@email.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid email or password");
    }

    @Test
    void login_shouldThrowWhenPasswordIsInvalid() {
        LoginRequest request = new LoginRequest("arthur@email.com", "wrong-password");
        User user = buildUser();

        when(userRepository.findByEmail("arthur@email.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrong-password", "hashed-password")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Invalid email or password");
    }

    private User buildUser() {
        User user = new User();
        user.setId(userId);
        user.setName("Arthur");
        user.setEmail("arthur@email.com");
        user.setPasswordHash("hashed-password");
        return user;
    }
}
