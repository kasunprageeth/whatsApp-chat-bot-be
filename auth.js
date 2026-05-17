/**
 * Authentication and authorization middleware
 * Supports both JWT token and x-user-id header for multi-tenant isolation
 */

const supabase = require("./supabase");

/**
 * Verify user authentication - Multi-tenant support
 * Supports two methods:
 * 1. JWT Bearer token (preferred) - extracts user_id from Supabase Auth
 * 2. x-user-id header (legacy) - for backward compatibility
 */
async function authMiddleware(req, res, next) {
  try {
    // Method 1: JWT Bearer Token (Recommended for multi-tenant)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      
      try {
        // Verify JWT with Supabase Auth
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
          return res.status(401).json({
            error: "Unauthorized - Invalid JWT token",
            status: 401
          });
        }
        
        // Attach user to request - user.id is the tenant ID
        req.userId = user.id;
        req.userEmail = user.email;
        req.authMethod = "jwt";
        return next();
      } catch (err) {
        console.error("JWT verification error:", err);
        return res.status(401).json({
          error: "Unauthorized - JWT verification failed",
          status: 401
        });
      }
    }

    // Method 2: x-user-id Header (Legacy support)
    const userId = req.headers['x-user-id'] || req.query.user_id;
    
    if (userId) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(401).json({
          error: "Unauthorized - Invalid user_id format",
          status: 401
        });
      }
      
      req.userId = userId;
      req.authMethod = "header";
      return next();
    }

    // No authentication method provided
    return res.status(401).json({
      error: "Unauthorized - Provide JWT Bearer token or x-user-id header",
      status: 401
    });
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({
      error: "Authentication error",
      status: 500
    });
  }
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
