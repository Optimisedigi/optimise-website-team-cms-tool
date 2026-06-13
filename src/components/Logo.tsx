"use client";

const Logo = () => {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        width: "100%",
      }}
    >
      <img
        src="/optimise-digital-logo-white.png"
        alt="Optimise Digital"
        style={{
          display: "block",
          height: "auto",
          maxWidth: "360px",
          width: "100%",
        }}
      />
      <p
        style={{
          color: "#d8ecf8",
          fontSize: "16px",
          fontWeight: 600,
          letterSpacing: "-0.01em",
          margin: 0,
          textAlign: "center",
        }}
      >
        Welcome to a new world of growth
      </p>
    </div>
  );
};

export default Logo;
