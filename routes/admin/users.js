import { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  updateUserPassword, 
  deleteUser,
  emailExists 
} from '../../lib/users.js';
import { logAudit } from '../../lib/audit.js';

export default async function adminUsersRoutes(fastify) {
  /**
   * GET /admin/users
   * List all users
   */
  fastify.get('/admin/users', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const users = getAllUsers();

    return reply.view('admin/users.ejs', {
      users,
      currentUser: request.session,
      success: request.query.success,
      error: request.query.error,
    });
  });

  /**
   * GET /admin/users/new
   * Show create user form
   */
  fastify.get('/admin/users/new', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    return reply.view('admin/user-form.ejs', {
      user: null,
      isNew: true,
      currentUser: request.session,
      error: request.query.error,
    });
  });

  /**
   * POST /admin/users
   * Create new user
   */
  fastify.post('/admin/users', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { email, password, role } = request.body;

    // Validation
    if (!email || !email.trim()) {
      return reply.redirect('/admin/users/new?error=missing_email');
    }

    if (!password || password.length < 6) {
      return reply.redirect('/admin/users/new?error=password_too_short');
    }

    const validRoles = ['admin', 'editor'];
    if (!role || !validRoles.includes(role)) {
      return reply.redirect('/admin/users/new?error=invalid_role');
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email exists
    if (emailExists(normalizedEmail)) {
      return reply.redirect('/admin/users/new?error=email_exists');
    }

    try {
      const userId = await createUser(normalizedEmail, password, role);

      logAudit(null, request.session.email, 'user_created', {
        created_user_id: userId,
        created_email: normalizedEmail,
        role,
      });

      fastify.log.info({
        admin_id: request.session.userId,
        created_user_id: userId,
        created_email: normalizedEmail,
        role,
        trace_id: request.id,
      }, 'User created');

      return reply.redirect('/admin/users?success=user_created');

    } catch (err) {
      fastify.log.error({ err }, 'Create user error');
      return reply.redirect('/admin/users/new?error=server_error');
    }
  });

  /**
   * GET /admin/users/:id/edit
   * Show edit user form
   */
  fastify.get('/admin/users/:id/edit', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const user = getUserById(parseInt(id, 10));

    if (!user) {
      return reply.redirect('/admin/users?error=user_not_found');
    }

    return reply.view('admin/user-form.ejs', {
      user,
      isNew: false,
      currentUser: request.session,
      error: request.query.error,
    });
  });

  /**
   * POST /admin/users/:id
   * Update user
   */
  fastify.post('/admin/users/:id', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = parseInt(id, 10);
    const { email, password, role, client_key } = request.body;

    const user = getUserById(userId);
    if (!user) {
      return reply.redirect('/admin/users?error=user_not_found');
    }

    // Validation
    if (!email || !email.trim()) {
      return reply.redirect(`/admin/users/${id}/edit?error=missing_email`);
    }

    const validRoles = ['admin', 'editor'];
    if (!role || !validRoles.includes(role)) {
      return reply.redirect(`/admin/users/${id}/edit?error=invalid_role`);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email exists (excluding current user)
    if (emailExists(normalizedEmail, userId)) {
      return reply.redirect(`/admin/users/${id}/edit?error=email_exists`);
    }

    try {
      // Update user details
      const trimmedClientKey = client_key ? client_key.trim() : null;
      updateUser(userId, { email: normalizedEmail, role, client_key: trimmedClientKey });

      // Update password if provided
      if (password && password.length > 0) {
        if (password.length < 6) {
          return reply.redirect(`/admin/users/${id}/edit?error=password_too_short`);
        }
        await updateUserPassword(userId, password);
      }

      logAudit(null, request.session.email, 'user_updated', {
        updated_user_id: userId,
        updated_email: normalizedEmail,
        role,
        password_changed: !!password,
      });

      fastify.log.info({
        admin_id: request.session.userId,
        updated_user_id: userId,
        updated_email: normalizedEmail,
        role,
        password_changed: !!password,
        trace_id: request.id,
      }, 'User updated');

      return reply.redirect('/admin/users?success=user_updated');

    } catch (err) {
      fastify.log.error({ err }, 'Update user error');
      return reply.redirect(`/admin/users/${id}/edit?error=server_error`);
    }
  });

  /**
   * POST /admin/users/:id/delete
   * Delete user
   */
  fastify.post('/admin/users/:id/delete', {
    preHandler: [fastify.requireAuth, fastify.requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;
    const userId = parseInt(id, 10);

    // Prevent self-deletion
    if (userId === request.session.userId) {
      return reply.redirect('/admin/users?error=cannot_delete_self');
    }

    const user = getUserById(userId);
    if (!user) {
      return reply.redirect('/admin/users?error=user_not_found');
    }

    try {
      deleteUser(userId);

      logAudit(null, request.session.email, 'user_deleted', {
        deleted_user_id: userId,
        deleted_email: user.email,
      });

      fastify.log.info({
        admin_id: request.session.userId,
        deleted_user_id: userId,
        deleted_email: user.email,
        trace_id: request.id,
      }, 'User deleted');

      return reply.redirect('/admin/users?success=user_deleted');

    } catch (err) {
      fastify.log.error({ err }, 'Delete user error');
      return reply.redirect('/admin/users?error=server_error');
    }
  });
}
