module.exports = async (req, res) => {
  const okEnv = Boolean(process.env.SF_LOGIN_URL && process.env.SF_USERNAME && process.env.SF_PASSWORD);
  res.status(200).json({
    ok: true,
    env_ready: okEnv,
    now: new Date().toISOString()
  });
};
