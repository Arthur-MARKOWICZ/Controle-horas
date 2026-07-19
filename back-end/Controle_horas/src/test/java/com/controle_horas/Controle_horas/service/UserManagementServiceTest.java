package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.controle_horas.Controle_horas.dto.CreateUserRequest;
import com.controle_horas.Controle_horas.dto.UserResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.UserRole;
import com.controle_horas.Controle_horas.exception.ForbiddenOperationException;
import com.controle_horas.Controle_horas.repository.UserRepository;
import com.controle_horas.Controle_horas.util.WorkDaysConverter;
import java.time.LocalTime;
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
class UserManagementServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private AccessControlService accessControlService;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private UserManagementService userManagementService;

    private User admin;

    @BeforeEach
    void setUp() {
        admin = new User();
        admin.setId(UUID.randomUUID());
        admin.setName("Admin");
        admin.setEmail("admin@email.com");
        admin.setPasswordHash("hash");
        admin.setRole(UserRole.ADMIN);
    }

    @Test
    void createUser_shouldSetCreatedByToActor() {
        CreateUserRequest request = new CreateUserRequest(
                "Colaborador",
                "user@email.com",
                "password123",
                "USER",
                null,
                LocalTime.of(8, 30),
                LocalTime.of(17, 20),
                true,
                60,
                WorkDaysConverter.defaultWorkDays());

        when(accessControlService.requireActor("admin@email.com")).thenReturn(admin);
        when(userRepository.existsByEmail("user@email.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("encoded");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(UUID.randomUUID());
            return user;
        });

        UserResponse response = userManagementService.createUser("admin@email.com", request);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        assertThat(userCaptor.getValue().getCreatedBy()).isEqualTo(admin);
        assertThat(userCaptor.getValue().getManager()).isEqualTo(admin);
        assertThat(response.createdById()).isEqualTo(admin.getId());
        assertThat(response.role()).isEqualTo("USER");
    }

    @Test
    void updateUser_shouldRejectWhenTargetIsNotAccessible() {
        UUID foreignUserId = UUID.randomUUID();
        when(accessControlService.requireActor("admin@email.com")).thenReturn(admin);
        when(accessControlService.requireAccessibleUser(admin, foreignUserId))
                .thenThrow(new ForbiddenOperationException("You do not have permission to access this user"));

        assertThatThrownBy(() -> userManagementService.updateUser(
                "admin@email.com",
                foreignUserId,
                new com.controle_horas.Controle_horas.dto.UpdateUserRequest(
                        "Name",
                        "USER",
                        null,
                        LocalTime.of(8, 30),
                        LocalTime.of(17, 20),
                        true,
                        60,
                        WorkDaysConverter.defaultWorkDays())))
                .isInstanceOf(ForbiddenOperationException.class);
    }

    @Test
    void createUser_shouldAllowAdminToCreateAnotherAdminUnderOwnership() {
        CreateUserRequest request = new CreateUserRequest(
                "Outro Admin",
                "admin2@email.com",
                "password123",
                "ADMIN",
                null,
                LocalTime.of(8, 30),
                LocalTime.of(17, 20),
                true,
                60,
                WorkDaysConverter.defaultWorkDays());

        when(accessControlService.requireActor("admin@email.com")).thenReturn(admin);
        when(userRepository.existsByEmail("admin2@email.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("encoded");
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> {
            User user = invocation.getArgument(0);
            user.setId(UUID.randomUUID());
            return user;
        });

        UserResponse response = userManagementService.createUser("admin@email.com", request);

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        assertThat(userCaptor.getValue().getCreatedBy()).isEqualTo(admin);
        assertThat(userCaptor.getValue().getManager()).isNull();
        assertThat(userCaptor.getValue().getRole()).isEqualTo(UserRole.ADMIN);
        assertThat(response.role()).isEqualTo("ADMIN");
    }
}
