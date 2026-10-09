export interface TabIntroProps {
  /** The question the tab answers. */
  title: string;
  /** One plain sentence (max ~80 characters). */
  sentence: string;
}

export function TabIntro({ title, sentence }: TabIntroProps) {
  return (
    <header className="wn-intro">
      <h2 className="wn-intro__title">{title}</h2>
      <p className="wn-intro__sentence">{sentence}</p>
    </header>
  );
}
