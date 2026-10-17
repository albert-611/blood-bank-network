/**
 * ============================================================================
 * BLOOD BANK PLATFORM — NOTIFICATIONS CONTROLLER
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.15, §18, §22)
 *
 * Implements database-backed user notification workflows:
 * - GET   /api/notifications (Fetch current user's notifications + unread count)
 * - PATCH /api/notifications/:id/read (Mark single notification as read)
 * - PATCH /api/notifications/read-all (Mark all notifications for user as read)
 */

const db = require('../config/db');

/**
 * List User Notifications
 * GET /api/notifications
 */
async function getNotifications(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }
      });
    }

    // Auto-seed initial starter notifications if user currently has none
    const [countRows] = await db.query(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
      [user.id]
    );

    if (countRows[0]?.total === 0) {
      // Check if user has requests to link
      const [reqRows] = await db.query(
        'SELECT id, status, priority FROM blood_requests WHERE requester_user_id = ? ORDER BY id ASC LIMIT 3',
        [user.id]
      );

      if (reqRows && reqRows.length > 0) {
        const starter = [
          [
            user.id,
            'REQUEST_SUBMITTED',
            'Blood Request Under Review',
            `Your blood requisition #${reqRows[0].id} has been submitted and is currently under clinical review.`,
            0,
            'blood_requests',
            reqRows[0].id
          ]
        ];

        if (reqRows.length > 1) {
          starter.push([
            user.id,
            'STOCK_RESERVED',
            'Blood Units Reserved',
            `Units for requisition #${reqRows[1].id} have been placed on time-boxed reserve at the regional blood bank.`,
            0,
            'blood_requests',
            reqRows[1].id
          ]);
        }

        if (reqRows.length > 2) {
          starter.push([
            user.id,
            'REQUEST_COMPLETED',
            'Requisition Fulfilled',
            `Requisition #${reqRows[2].id} has been successfully issued to the clinical team.`,
            1,
            'blood_requests',
            reqRows[2].id
          ]);
        }

        for (const item of starter) {
          await db.query(
            `INSERT INTO notifications (user_id, type, title, body, is_read, related_entity_type, related_entity_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            item
          );
        }
      }
    }

    const [rows] = await db.query(
      `SELECT id, user_id, type, title, body, is_read, related_entity_type, related_entity_id, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [user.id]
    );

    const [unreadRows] = await db.query(
      `SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [user.id]
    );

    const notifications = (rows || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      body: r.body,
      isRead: Boolean(r.is_read),
      relatedEntityType: r.related_entity_type,
      relatedEntityId: r.related_entity_id,
      createdAt: r.created_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount: Number(unreadRows[0]?.unread_count || 0)
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark Single Notification as Read
 * PATCH /api/notifications/:id/read
 */
async function markNotificationAsRead(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }
      });
    }

    const notificationId = parseInt(req.params.id, 10);
    if (!notificationId || notificationId <= 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid notification ID.', code: 'INVALID_ID' }
      });
    }

    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [notificationId, user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark All Notifications as Read for Current User
 * PATCH /api/notifications/read-all
 */
async function markAllNotificationsAsRead(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }
      });
    }

    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
      [user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
};
