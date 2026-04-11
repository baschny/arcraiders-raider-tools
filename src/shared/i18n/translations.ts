import type { AppLocale } from './config';

type TranslationValue = string | TranslationDictionary;

export interface TranslationDictionary {
  [key: string]: TranslationValue;
}

export const translations: Record<AppLocale, TranslationDictionary> = {
  en: {
    app: {
      name: 'ARC Raiders Tools',
    },
    shared: {
      language: 'Language',
      loading: 'Loading...',
      errorPrefix: 'Error',
      header: {
        switchTool: 'Switch Tool',
        switchLanguage: 'Switch Language',
        languageLabel: 'Language',
      },
      sidebar: {
        title: 'Tools',
        collapse: 'Collapse',
        expand: 'Expand sidebar',
        collapseTitle: 'Collapse sidebar',
      },
      footer: {
        thanksPrefix: 'Data provided by ',
        thanksMiddle: ' and ',
        thanksSuffix: '. Thank you for making this data available!',
        contactDiscord: 'Contact baschny on Discord (opens external app)',
        joinDiscord: 'Join ARCTracker.io Discord server (opens external app)',
        contact: 'Contact',
        arcTrackerDiscord: 'ARCTracker Discord',
      },
      tools: {
        home: 'Home',
        schedule: 'Event Schedule',
        craftCalculator: 'Craft Calculator',
        quests: 'Quest Tracker',
        lootHelper: 'Looting Helper',
        quartermaster: 'Quartermaster',
      },
    },
    dashboard: {
      title: 'Raider Tools',
      intro:
        'Welcome! This is my personal collection of ARC Raiders tools. These started as private projects to help me out in-game, but I figured they were too useful not to share. If they help you out, let me know! Pick a tool below and dive in.',
      tools: {
        schedule:
          'Visualize the ARC Raiders map events schedule in a better overview to plan your raids.',
        craftCalculator:
          'Calculate how many items to craft to squeeze the most space out of your stash.',
        quests: 'Track your quest progress with an interactive quest tree.',
        lootHelper: 'Visualize crafting chains to know what to loot during raids.',
        quartermaster: 'Plan your stash, loadout, and hideout requirements in one place.',
      },
    },
    pages: {
      notFound: 'Page not found',
      profileSettings: 'Profile Settings',
    },
    schedule: {
      loading: 'Loading event schedule...',
      noData: 'No data available',
      previousDay: 'Previous day',
      nextDay: 'Next day',
      goToToday: 'Go to today',
      updated: 'Updated',
      mapHeader: 'Map',
    },
    quests: {
      loading: 'Loading quest data...',
      noData: 'No quest data available',
      confirmMarkIncompleteTitle: 'Mark quest as incomplete?',
      confirmMarkIncompleteMessage:
        'Marking "{quest}" as incomplete will also mark {count} dependent quest(s) as incomplete:',
      confirmAutocompleteTitle: 'Auto-complete prerequisites?',
      confirmAutocompleteMessage:
        '"{quest}" has {count} incomplete prerequisite(s):',
      resetAllTitle: 'Reset all quests?',
      resetAllMessage: 'Do you want to reset all {count} completed quest(s)?',
      sidebarCompleted: 'Completed quests',
      sidebarTotal: 'Total quests',
      sidebarAvailable: 'Available quests',
      sidebarUnlockedMaps: 'Unlocked Maps ({completed}/{total})',
      sidebarAvailableHeader: 'Available',
      sidebarResetAll: 'Reset all',
      sidebarResetAllTitle: 'Reset all completed quests',
      sidebarNoAvailable: 'No quests available. Complete prerequisites first.',
      sidebarSearchPlaceholder: 'Search all quests...',
      sidebarSearchResults: 'Search Results ({count})',
      sidebarSearchEmpty: 'No quests found matching "{query}"',
      sidebarFocusQuest: 'Click to focus on this quest',
      sidebarViewMap: 'Click to view in quest tree',
      sidebarUnlockMap: 'Click to unlock this map',
      mapUnlocked: 'Unlocked',
      mapLocked: 'Locked',
      rewardsBlueprint: 'Rewards a blueprint',
      rewardsList: 'Rewards {rewards}',
      statusCompleted: 'Completed',
      statusAvailable: 'Available',
      statusLocked: 'Locked',
      wikiTitle: 'Open in ARC Raiders Wiki (new tab)',
      wikiLabel: 'Wiki',
      blueprintsToggleShow: 'Show blueprint rewards',
      blueprintsToggleHide: 'Hide blueprint rewards',
      blueprintsLabel: 'Blueprints ({completed}/{total})',
      blueprintsJumpToQuest: 'Jump to quest: {quest}',
      completedLabel: 'Completed',
      dialogMore: '...and {count} more',
      dialogCancel: 'Cancel',
      dialogConfirm: 'Confirm',
    },
    lootHelper: {
      loading: 'Loading item data...',
      noData: 'No item data available',
    },
    craftCalculator: {
      loading: 'Loading item data...',
    },
  },
  de: {
    app: {
      name: 'ARC Raiders Tools',
    },
    shared: {
      language: 'Sprache',
      loading: 'Wird geladen...',
      errorPrefix: 'Fehler',
      header: {
        switchTool: 'Tool wechseln',
        switchLanguage: 'Sprache wechseln',
        languageLabel: 'Sprache',
      },
      sidebar: {
        title: 'Tools',
        collapse: 'Einklappen',
        expand: 'Seitenleiste ausklappen',
        collapseTitle: 'Seitenleiste einklappen',
      },
      footer: {
        thanksPrefix: 'Daten bereitgestellt von ',
        thanksMiddle: ' und ',
        thanksSuffix: '. Vielen Dank, dass diese Daten verfügbar gemacht werden.',
        contactDiscord: 'baschny auf Discord kontaktieren (öffnet externe App)',
        joinDiscord: 'ARCTracker.io Discord-Server beitreten (öffnet externe App)',
        contact: 'Kontakt',
        arcTrackerDiscord: 'ARCTracker Discord',
      },
      tools: {
        home: 'Start',
        schedule: 'Ereignisplan',
        craftCalculator: 'Crafting-Rechner',
        quests: 'Quest-Tracker',
        lootHelper: 'Loot-Helfer',
        quartermaster: 'Quartermaster',
      },
    },
    dashboard: {
      title: 'Raider Tools',
      intro:
        'Willkommen! Das ist meine persönliche Sammlung von ARC Raiders Tools. Sie begannen als private Projekte, um mir im Spiel zu helfen, waren aber zu nützlich, um sie nicht zu teilen. Wenn sie dir helfen, sag mir gern Bescheid. Wähle unten ein Tool aus und leg los.',
      tools: {
        schedule:
          'Visualisiere den ARC Raiders Karten-Ereignisplan in einer besseren Übersicht, um deine Raids zu planen.',
        craftCalculator:
          'Berechne, wie viele Gegenstände du craften solltest, um den Platz in deinem Lager optimal zu nutzen.',
        quests: 'Verfolge deinen Questfortschritt mit einem interaktiven Questbaum.',
        lootHelper: 'Visualisiere Crafting-Ketten, um zu wissen, was du in Raids looten solltest.',
        quartermaster: 'Plane Lager, Ausrüstung und Hideout-Anforderungen an einem Ort.',
      },
    },
    pages: {
      notFound: 'Seite nicht gefunden',
      profileSettings: 'Profileinstellungen',
    },
    schedule: {
      loading: 'Ereignisplan wird geladen...',
      noData: 'Keine Daten verfügbar',
      previousDay: 'Vorheriger Tag',
      nextDay: 'Nächster Tag',
      goToToday: 'Zu heute wechseln',
      updated: 'Aktualisiert',
      mapHeader: 'Karte',
    },
    quests: {
      loading: 'Questdaten werden geladen...',
      noData: 'Keine Questdaten verfügbar',
      confirmMarkIncompleteTitle: 'Quest als unvollständig markieren?',
      confirmMarkIncompleteMessage:
        'Wenn „{quest}“ als unvollständig markiert wird, werden auch {count} abhängige Quest(s) als unvollständig markiert:',
      confirmAutocompleteTitle: 'Voraussetzungen automatisch abschließen?',
      confirmAutocompleteMessage:
        '„{quest}“ hat {count} unvollständige Voraussetzung(en):',
      resetAllTitle: 'Alle Quests zurücksetzen?',
      resetAllMessage: 'Möchtest du alle {count} abgeschlossenen Quest(s) zurücksetzen?',
      sidebarCompleted: 'Abgeschlossene Quests',
      sidebarTotal: 'Quests insgesamt',
      sidebarAvailable: 'Verfügbare Quests',
      sidebarUnlockedMaps: 'Freigeschaltete Karten ({completed}/{total})',
      sidebarAvailableHeader: 'Verfügbar',
      sidebarResetAll: 'Alles zurücksetzen',
      sidebarResetAllTitle: 'Alle abgeschlossenen Quests zurücksetzen',
      sidebarNoAvailable: 'Keine Quests verfügbar. Schließe zuerst Voraussetzungen ab.',
      sidebarSearchPlaceholder: 'Alle Quests durchsuchen...',
      sidebarSearchResults: 'Suchergebnisse ({count})',
      sidebarSearchEmpty: 'Keine Quests passend zu „{query}“ gefunden',
      sidebarFocusQuest: 'Klicken, um diese Quest zu fokussieren',
      sidebarViewMap: 'Klicken, um sie im Questbaum anzuzeigen',
      sidebarUnlockMap: 'Klicken, um diese Karte freizuschalten',
      mapUnlocked: 'Freigeschaltet',
      mapLocked: 'Gesperrt',
      rewardsBlueprint: 'Belohnt mit einer Blaupause',
      rewardsList: 'Belohnt mit {rewards}',
      statusCompleted: 'Abgeschlossen',
      statusAvailable: 'Verfügbar',
      statusLocked: 'Gesperrt',
      wikiTitle: 'In ARC Raiders Wiki öffnen (neuer Tab)',
      wikiLabel: 'Wiki',
      blueprintsToggleShow: 'Blaupausen anzeigen',
      blueprintsToggleHide: 'Blaupausen ausblenden',
      blueprintsLabel: 'Blaupausen ({completed}/{total})',
      blueprintsJumpToQuest: 'Zur Quest springen: {quest}',
      completedLabel: 'Abgeschlossen',
      dialogMore: '...und {count} weitere',
      dialogCancel: 'Abbrechen',
      dialogConfirm: 'Bestätigen',
    },
    lootHelper: {
      loading: 'Gegenstandsdaten werden geladen...',
      noData: 'Keine Gegenstandsdaten verfügbar',
    },
    craftCalculator: {
      loading: 'Gegenstandsdaten werden geladen...',
    },
  },
  'pt-BR': {
    app: {
      name: 'ARC Raiders Tools',
    },
    shared: {
      language: 'Idioma',
      loading: 'Carregando...',
      errorPrefix: 'Erro',
      header: {
        switchTool: 'Trocar ferramenta',
        switchLanguage: 'Trocar idioma',
        languageLabel: 'Idioma',
      },
      sidebar: {
        title: 'Ferramentas',
        collapse: 'Recolher',
        expand: 'Expandir barra lateral',
        collapseTitle: 'Recolher barra lateral',
      },
      footer: {
        thanksPrefix: 'Dados fornecidos por ',
        thanksMiddle: ' e ',
        thanksSuffix: '. Obrigado por disponibilizarem esses dados.',
        contactDiscord: 'Falar com baschny no Discord (abre app externo)',
        joinDiscord: 'Entrar no Discord do ARCTracker.io (abre app externo)',
        contact: 'Contato',
        arcTrackerDiscord: 'Discord do ARCTracker',
      },
      tools: {
        home: 'Início',
        schedule: 'Agenda de eventos',
        craftCalculator: 'Calculadora de craft',
        quests: 'Rastreador de missões',
        lootHelper: 'Assistente de loot',
        quartermaster: 'Quartermaster',
      },
    },
    dashboard: {
      title: 'Raider Tools',
      intro:
        'Bem-vindo! Esta é a minha coleção pessoal de ferramentas para ARC Raiders. Elas começaram como projetos privados para me ajudar no jogo, mas eram úteis demais para não compartilhar. Se elas te ajudarem, me avise. Escolha uma ferramenta abaixo e comece.',
      tools: {
        schedule:
          'Visualize a agenda de eventos dos mapas de ARC Raiders em uma visão melhor para planejar seus raids.',
        craftCalculator:
          'Calcule quantos itens craftar para aproveitar melhor o espaço do seu baú.',
        quests: 'Acompanhe o progresso das suas missões com uma árvore interativa.',
        lootHelper: 'Visualize cadeias de crafting para saber o que pegar durante os raids.',
        quartermaster: 'Planeje seu baú, loadout e requisitos do hideout em um só lugar.',
      },
    },
    pages: {
      notFound: 'Página não encontrada',
      profileSettings: 'Configurações de perfil',
    },
    schedule: {
      loading: 'Carregando agenda de eventos...',
      noData: 'Nenhum dado disponível',
      previousDay: 'Dia anterior',
      nextDay: 'Próximo dia',
      goToToday: 'Ir para hoje',
      updated: 'Atualizado',
      mapHeader: 'Mapa',
    },
    quests: {
      loading: 'Carregando dados das missões...',
      noData: 'Nenhum dado de missão disponível',
      confirmMarkIncompleteTitle: 'Marcar missão como incompleta?',
      confirmMarkIncompleteMessage:
        'Marcar "{quest}" como incompleta também marcará {count} missão(ões) dependente(s) como incompletas:',
      confirmAutocompleteTitle: 'Completar pré-requisitos automaticamente?',
      confirmAutocompleteMessage:
        '"{quest}" tem {count} pré-requisito(s) incompleto(s):',
      resetAllTitle: 'Redefinir todas as missões?',
      resetAllMessage: 'Deseja redefinir todas as {count} missões concluídas?',
      sidebarCompleted: 'Missões concluídas',
      sidebarTotal: 'Total de missões',
      sidebarAvailable: 'Missões disponíveis',
      sidebarUnlockedMaps: 'Mapas desbloqueados ({completed}/{total})',
      sidebarAvailableHeader: 'Disponíveis',
      sidebarResetAll: 'Redefinir tudo',
      sidebarResetAllTitle: 'Redefinir todas as missões concluídas',
      sidebarNoAvailable: 'Nenhuma missão disponível. Complete os pré-requisitos primeiro.',
      sidebarSearchPlaceholder: 'Pesquisar todas as missões...',
      sidebarSearchResults: 'Resultados da pesquisa ({count})',
      sidebarSearchEmpty: 'Nenhuma missão encontrada para "{query}"',
      sidebarFocusQuest: 'Clique para focar nesta missão',
      sidebarViewMap: 'Clique para ver na árvore de missões',
      sidebarUnlockMap: 'Clique para desbloquear este mapa',
      mapUnlocked: 'Desbloqueado',
      mapLocked: 'Bloqueado',
      rewardsBlueprint: 'Recompensa uma Esquema',
      rewardsList: 'Recompensa {rewards}',
      statusCompleted: 'Concluída',
      statusAvailable: 'Disponível',
      statusLocked: 'Bloqueada',
      wikiTitle: 'Abrir na Wiki de ARC Raiders (nova aba)',
      wikiLabel: 'Wiki',
      blueprintsToggleShow: 'Mostrar esquemas',
      blueprintsToggleHide: 'Ocultar esquemas',
      blueprintsLabel: 'Esquemas ({completed}/{total})',
      blueprintsJumpToQuest: 'Ir para a missão: {quest}',
      completedLabel: 'Concluída',
      dialogMore: '...e mais {count}',
      dialogCancel: 'Cancelar',
      dialogConfirm: 'Confirmar',
    },
    lootHelper: {
      loading: 'Carregando dados dos itens...',
      noData: 'Nenhum dado de item disponível',
    },
    craftCalculator: {
      loading: 'Carregando dados dos itens...',
    },
  },
};

export function getTranslationValue(locale: AppLocale, key: string): string | undefined {
  const parts = key.split('.');
  let current: TranslationValue | undefined = translations[locale];

  for (const part of parts) {
    if (!current || typeof current === 'string') {
      return undefined;
    }
    current = current[part];
  }

  return typeof current === 'string' ? current : undefined;
}
