import './ChatlistItem.scss';

export const ChatlistItem = (props: Record<string, unknown>): string => `
  <li class="chatlist__item ${props.active ? 'chatlist__item_active' : ''}">
    <div class="chatlist__item__wrapper">
      <div class="chatlist__item__avatar"></div>
      <div class="chatlist__item__text">
        <div class="chatlist__item__name">${props.user}</div>
        <div class="chatlist__item__message">
          <span class="chatlist__item__message__quote">${props.quote}</span>
        </div>
      </div>
      <div class="chatlist__item__info">
        <div class="chatlist__item__time">${props.when}</div>
        <div class="chatlist__item__unreads">
          <span class="chatlist__item__unreads__count"
            >${props.unreads||''}</span>
        </div>
      </div>
    </div>
  </li>
`;
