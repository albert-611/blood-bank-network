/**
 * ============================================================================
 * BLOOD BANK PLATFORM — NOTIFICATIONS ROUTES
 * ============================================================================
 * Architecture Reference: BLOOD_BANK_PLATFORM_PLAN.md (§9.15, §18, §22)
 *
 * Exposes endpoints for user notifications with strict user ownership scoping.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

// All notification operations require authentication
router.use(authenticate);

/**
 * @route   GET /api/notifications
 * @desc    Fetch authenticated user's notifications and unread count
 * @access  Protected
 */
router.get('/', notificationController.getNotifications);

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all notifications for authenticated user as read
 * @access  Protected
 */
router.patch('/read-all', notificationController.markAllNotificationsAsRead);

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark specific notification as read (user scoped)
 * @access  Protected
 */
router.patch('/:id/read', notificationController.markNotificationAsRead);

module.exports = router;
