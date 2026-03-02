const handleSignup = async (e) => {
  e.preventDefault();
  setLoading(true);

  // Ambil data dari state atau FormData
  const dataForm = {
    nama: e.target.nama.value,
    username: e.target.username.value,
    password: e.target.password.value,
    pertanyaan: e.target.pertanyaan.value,
    jawaban: e.target.jawaban.value
  };

  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataForm)
    });

    const result = await res.json();
    if (result.success) {
      alert("✅ Berhasil! Silakan Login.");
      window.location.href = "/login";
    } else {
      alert("❌ " + result.error);
    }
  } catch (err) {
    alert("❌ Koneksi Terputus");
  } finally {
    setLoading(false);
  }
};