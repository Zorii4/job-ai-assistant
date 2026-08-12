export function PrivacyPolicyPlaceholderPage({ onBack }: { onBack: () => void }) {
  return <section className="privacy-policy-placeholder" aria-labelledby="privacy-policy-title">
    <div className="page-heading">
      <h1 id="privacy-policy-title">Политика обработки персональных данных</h1>
      <p>Документ готовится и пока не является опубликованной политикой обработки персональных данных.</p>
    </div>
    <p>Подтверждение обезличенной версии означает только, что вы проверили конкретный текст перед его возможным использованием в AI-сценарии. Оно не заменяет юридическое согласие или другие основания обработки персональных данных.</p>
    <button className="button button--secondary" type="button" onClick={onBack}>Вернуться к резюме</button>
  </section>;
}
