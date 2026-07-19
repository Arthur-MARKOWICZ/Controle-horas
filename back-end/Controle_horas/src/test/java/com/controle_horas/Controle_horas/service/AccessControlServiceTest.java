package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.UserRole;
import com.controle_horas.Controle_horas.exception.ForbiddenOperationException;
import com.controle_horas.Controle_horas.repository.UserRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AccessControlServiceTest {

    @Mock
    private UserRepository userRepository;

    private AccessControlService accessControlService;

    private User adminA;
    private User adminB;
    private User managerUnderA;
    private User userUnderManager;
    private User userUnderB;

    @BeforeEach
    void setUp() {
        accessControlService = new AccessControlService(userRepository);

        adminA = buildUser("admin-a@example.com", UserRole.ADMIN, null);
        adminB = buildUser("admin-b@example.com", UserRole.ADMIN, null);
        managerUnderA = buildUser("manager@example.com", UserRole.MANAGER, adminA);
        managerUnderA.setManager(adminA);
        userUnderManager = buildUser("user@example.com", UserRole.USER, managerUnderA);
        userUnderManager.setManager(managerUnderA);
        userUnderB = buildUser("other@example.com", UserRole.USER, adminB);
        userUnderB.setManager(adminB);
    }

    @Test
    void canAccess_adminCannotAccessUserFromAnotherCompany() {
        assertThat(accessControlService.canAccess(adminA, userUnderB)).isFalse();
        assertThat(accessControlService.canAccess(adminA, adminB)).isFalse();
    }

    @Test
    void canAccess_adminCanAccessUserCreatedByManagerInOwnTree() {
        assertThat(accessControlService.canAccess(adminA, managerUnderA)).isTrue();
        assertThat(accessControlService.canAccess(adminA, userUnderManager)).isTrue();
    }

    @Test
    void canAccess_managerOnlyAccessesDirectSubordinates() {
        assertThat(accessControlService.canAccess(managerUnderA, userUnderManager)).isTrue();
        assertThat(accessControlService.canAccess(managerUnderA, adminA)).isFalse();
        assertThat(accessControlService.canAccess(managerUnderA, userUnderB)).isFalse();
    }

    @Test
    void assertCanAccess_throwsWhenOutsideTree() {
        assertThatThrownBy(() -> accessControlService.assertCanAccess(adminA, userUnderB))
                .isInstanceOf(ForbiddenOperationException.class)
                .hasMessage("You do not have permission to access this user");
    }

    @Test
    void listAccessibleUsers_adminReturnsOwnSubtreeOnly() {
        when(userRepository.findByCreatedByIdOrderByNameAsc(adminA.getId()))
                .thenReturn(List.of(managerUnderA));
        when(userRepository.findByCreatedByIdOrderByNameAsc(managerUnderA.getId()))
                .thenReturn(List.of(userUnderManager));
        when(userRepository.findByCreatedByIdOrderByNameAsc(userUnderManager.getId()))
                .thenReturn(List.of());

        List<User> accessible = accessControlService.listAccessibleUsers(adminA);

        assertThat(accessible)
                .extracting(User::getId)
                .containsExactly(adminA.getId(), managerUnderA.getId(), userUnderManager.getId());
    }

    @Test
    void listAccessibleUsers_managerReturnsSelfAndDirectTeam() {
        when(userRepository.findByManagerIdOrderByNameAsc(managerUnderA.getId()))
                .thenReturn(List.of(userUnderManager));

        List<User> accessible = accessControlService.listAccessibleUsers(managerUnderA);

        assertThat(accessible)
                .extracting(User::getId)
                .containsExactly(managerUnderA.getId(), userUnderManager.getId());
    }

    private User buildUser(String email, UserRole role, User createdBy) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail(email);
        user.setName(email);
        user.setRole(role);
        user.setCreatedBy(createdBy);
        return user;
    }
}
