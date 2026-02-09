"use client";

const DashboardWelcome = () => {
  return (
    <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" }}>
      <img
        src="/optimise-rocket-logo-black.png"
        alt="Optimise Digital"
        style={{
          height: 50,
          objectFit: "contain",
        }}
      />
      <h2
        style={{
          fontSize: "24px",
          fontWeight: 700,
          margin: 0,
        }}
      >
        Welcome to a new world of growth
      </h2>
    </div>
  );
};

export default DashboardWelcome;
