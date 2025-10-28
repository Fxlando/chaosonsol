/**
 * Navigation State Manager
 * Tracks user's position in the menu hierarchy and allows returning to previous positions
 * after completing actions like buy, sell, transfer, etc.
 */

class NavigationStateManager {
  constructor() {
    this.userStates = new Map(); // userId -> navigation state
    this.maxHistorySize = 10; // Maximum number of positions to remember per user
  }

  /**
   * Save the current navigation position for a user
   * @param {number} userId - Telegram user ID
   * @param {string} callbackData - The callback data that represents current position
   * @param {string} menuTitle - Human-readable title of current menu
   * @param {Object} additionalData - Any additional context data
   */
  savePosition(userId, callbackData, menuTitle, additionalData = {}) {
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, {
        history: [],
        currentPosition: null
      });
    }

    const userState = this.userStates.get(userId);
    
    // Add current position to history if it's different from the last one
    if (!userState.currentPosition || userState.currentPosition.callbackData !== callbackData) {
      const position = {
        callbackData,
        menuTitle,
        timestamp: Date.now(),
        additionalData
      };

      // Add to history
      userState.history.push(position);
      
      // Limit history size
      if (userState.history.length > this.maxHistorySize) {
        userState.history.shift();
      }
    }

    // Update current position
    userState.currentPosition = {
      callbackData,
      menuTitle,
      timestamp: Date.now(),
      additionalData
    };
  }

  /**
   * Get the last saved position for a user
   * @param {number} userId - Telegram user ID
   * @returns {Object|null} The last position or null if none exists
   */
  getLastPosition(userId) {
    const userState = this.userStates.get(userId);
    if (!userState || !userState.currentPosition) {
      return null;
    }
    return userState.currentPosition;
  }

  /**
   * Get the previous position in history (go back one step)
   * @param {number} userId - Telegram user ID
   * @returns {Object|null} The previous position or null if none exists
   */
  getPreviousPosition(userId) {
    const userState = this.userStates.get(userId);
    if (!userState || userState.history.length < 2) {
      return null;
    }
    
    // Return the second-to-last position (previous position)
    return userState.history[userState.history.length - 2];
  }

  /**
   * Clear navigation history for a user
   * @param {number} userId - Telegram user ID
   */
  clearHistory(userId) {
    this.userStates.delete(userId);
  }

  /**
   * Get navigation history for a user (for debugging)
   * @param {number} userId - Telegram user ID
   * @returns {Array} Array of navigation positions
   */
  getHistory(userId) {
    const userState = this.userStates.get(userId);
    return userState ? userState.history : [];
  }

  /**
   * Check if user has a saved position
   * @param {number} userId - Telegram user ID
   * @returns {boolean} True if user has saved position
   */
  hasPosition(userId) {
    const userState = this.userStates.get(userId);
    return userState && userState.currentPosition !== null;
  }

  /**
   * Get all users with saved positions (for debugging)
   * @returns {Array} Array of user IDs
   */
  getAllUsers() {
    return Array.from(this.userStates.keys());
  }

  /**
   * Clean up old navigation states (older than 1 hour)
   */
  cleanup() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [userId, userState] of this.userStates) {
      // Remove old positions from history
      userState.history = userState.history.filter(
        position => position.timestamp > oneHourAgo
      );
      
      // Remove user if no recent positions
      if (userState.history.length === 0) {
        this.userStates.delete(userId);
      }
    }
  }

  /**
   * Get navigation state summary for a user
   * @param {number} userId - Telegram user ID
   * @returns {Object} Navigation state summary
   */
  getStateSummary(userId) {
    const userState = this.userStates.get(userId);
    if (!userState) {
      return {
        hasPosition: false,
        currentPosition: null,
        historyLength: 0
      };
    }

    return {
      hasPosition: userState.currentPosition !== null,
      currentPosition: userState.currentPosition,
      historyLength: userState.history.length,
      lastPosition: userState.history[userState.history.length - 1] || null
    };
  }
}

// Create a singleton instance
const navigationStateManager = new NavigationStateManager();

// Clean up old states every 30 minutes
setInterval(() => {
  navigationStateManager.cleanup();
}, 30 * 60 * 1000);

module.exports = navigationStateManager;
