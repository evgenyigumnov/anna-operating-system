function App() {
  const handleQuit = async () => {
    await window.appControls.quit();
  };

  return (
    <main className="app">
      <section className="card">
        <h1>Здравствуйте, пользователь</h1>
        <button type="button" onClick={handleQuit}>
          Выйти из приложения
        </button>
      </section>
    </main>
  );
}

export default App;
