import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AdminPrivilege } from './internal-admin.config';
import { AdminPrivilegeGuard } from './admin-privilege.guard';

interface TestUser {
  sub?: string;
  email?: string;
  roles?: string[];
  internal_admin?: boolean;
  internal_admin_level?: 'read' | 'write';
}

describe('AdminPrivilegeGuard', () => {
  let guard: AdminPrivilegeGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const createGuard = (adminUserIds: string = '') => {
    mockReflector = {
      getAllAndOverride: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as jest.Mocked<Reflector>;

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_USER_IDS' ? adminUserIds : defaultValue || '',
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as jest.Mocked<ConfigService>;

    return new AdminPrivilegeGuard(mockReflector, mockConfigService);
  };

  const createMockContext = (user: TestUser = {}): ExecutionContext => {
    const baseUser = {
      sub: user.sub || 'test-user-id',
      email: user.email || 'test@example.com',
      roles: user.roles || [],
      ...user,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: baseUser,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  describe('Priority 1: Supabase app_metadata (PRIMARY)', () => {
    beforeEach(() => {
      guard = createGuard('');
    });

    it('should grant ADMIN_READ for internal_admin=true with level=read', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);
      const context = createMockContext({
        internal_admin: true,
        internal_admin_level: 'read',
      });

      expect(() => guard.canActivate(context)).not.toThrow();
    });

    it('should grant ADMIN_WRITE for internal_admin=true with level=write', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_WRITE);
      const context = createMockContext({
        internal_admin: true,
        internal_admin_level: 'write',
      });

      expect(() => guard.canActivate(context)).not.toThrow();
    });

    it('should deny ADMIN_WRITE when user has only READ level', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_WRITE);
      const context = createMockContext({
        internal_admin: true,
        internal_admin_level: 'read',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should default to READ when internal_admin=true but level not specified', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);
      const context = createMockContext({
        internal_admin: true,
        internal_admin_level: undefined,
      });

      expect(() => guard.canActivate(context)).not.toThrow();
    });

    it('should deny when internal_admin=false', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);
      const context = createMockContext({
        internal_admin: false,
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Priority 2: JWT roles (LEGACY)', () => {
    beforeEach(() => {
      guard = createGuard('');
    });

    it('should grant READ when ADMIN_READ role present and no app_metadata', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);
      const context = createMockContext({
        roles: ['ADMIN_READ'],
        internal_admin: undefined,
      });

      expect(() => guard.canActivate(context)).not.toThrow();
    });

    it('should grant WRITE when ADMIN_WRITE role present', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_WRITE);
      const context = createMockContext({
        roles: ['ADMIN_WRITE'],
        internal_admin: undefined,
      });

      expect(() => guard.canActivate(context)).not.toThrow();
    });

    it('should prefer app_metadata over roles when both present', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_WRITE);
      const context = createMockContext({
        internal_admin: true,
        internal_admin_level: 'read', // READ via app_metadata
        roles: ['ADMIN_WRITE'], // WRITE via roles
      });

      // Should deny because app_metadata takes priority and says READ only
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('ENV Deny-List (DENY ONLY)', () => {
    it('should deny access when user NOT in ADMIN_USER_IDS list', () => {
      const guardWithList = createGuard('test-user-id');
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);

      const context = createMockContext({
        sub: 'other-user-id', // Not in list
        internal_admin: true,
        internal_admin_level: 'read',
      });

      expect(() => guardWithList.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow when user in list and has JWT privilege', () => {
      const guardWithList = createGuard('test-user-id');
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);

      const context = createMockContext({
        sub: 'test-user-id', // In list
        internal_admin: true,
        internal_admin_level: 'read',
      });

      expect(() => guardWithList.canActivate(context)).not.toThrow();
    });

    it('should allow all users when ADMIN_USER_IDS is empty', () => {
      guard = createGuard('');
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);

      const context = createMockContext({
        internal_admin: true,
        internal_admin_level: 'read',
      });

      expect(() => guard.canActivate(context)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      guard = createGuard('');
    });

    it('should deny when no privilege metadata defined on handler', () => {
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      const context = createMockContext({
        internal_admin: true,
        internal_admin_level: 'write',
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should deny when user has no privilege source', () => {
      mockReflector.getAllAndOverride.mockReturnValue(AdminPrivilege.ADMIN_READ);
      const context = createMockContext({
        internal_admin: undefined,
        roles: [],
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });
});
