export const requireContextRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.contextRole)) {
      return res.status(403).json({
        message: "Access denied for your role",
      });
    }
    next();
  };
};
