/**
 * Authentication and authorization middleware
 */

/**
 * Verify user authentication
 * Expects user_id in header or query parameter
 */
function authMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'] || req.query.user_id;
  
  if (!userId) {
    return res.status(401).json({
      error: "Unauthorized - Missing user_id",
      status: 401
    });
  }
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return res.status(401).json({
      error: "Unauthorized - Invalid user_id format",
      status: 401
    });
  }
  
  req.userId = userId;
  next();
}

/**
 * Verify request body has required fields
 */
function validateRequest(requiredFields) {
  return (req, res, next) => {
    const missing = [];
    
    for (const field of requiredFields) {
      if (!(field in req.body)) {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
        status: 400
      });
    }
    
    next();
  };
}

/**
 * Error handling middleware
 */
function errorHandler(err, req, res, next) {
  console.error("Error:", err);
  
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    status: err.status || 500
  });
}

module.exports = {
  authMiddleware,
  validateRequest,
  errorHandler
};
